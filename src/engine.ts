// Fairy-Stockfish (WASM, NNUE) wrapper: one search at a time, newest request wins.
import { VARIANT } from './janggi'

declare global {
  interface Window {
    Stockfish?: (opts?: Record<string, unknown>) => Promise<StockfishModule>
  }
}

interface StockfishModule {
  postMessage(cmd: string): void
  addMessageListener(fn: (line: string) => void): void
  FS: { writeFile(path: string, data: Uint8Array): void }
}

export interface EngineLine {
  multipv: number
  depth: number
  cp?: number // side-to-move perspective
  mate?: number // side-to-move perspective
  pv: string[]
}

export interface Analysis {
  fen: string
  depth: number
  lines: EngineLine[]
  done: boolean
}

type Callback = (a: Analysis) => void

interface Request {
  fen: string
  cb: Callback
  depth: number
  multiPv: number
}

const BASE = '/engine/'
const NNUE = 'janggi-9991472750de.nnue'

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`failed to load ${src}`))
    document.head.appendChild(s)
  })
}

export class Engine {
  private sf: StockfishModule
  private state: 'idle' | 'searching' | 'stopping' = 'idle'
  private pending: Request | null = null
  private current: (Request & { lines: EngineLine[]; depth: number }) | null = null
  private multiPv = 0
  maxDepth = 24

  private constructor(sf: StockfishModule) {
    this.sf = sf
    sf.addMessageListener((line) => this.onLine(line))
  }

  static async create(): Promise<Engine> {
    if (!window.crossOriginIsolated) throw new Error('crossOriginIsolated가 아니라서 엔진 스레드를 쓸 수 없어요')
    if (!window.Stockfish) await loadScript(BASE + 'stockfish.js')
    const [sf, net] = await Promise.all([
      window.Stockfish!({
        locateFile: (f: string) => BASE + f,
        mainScriptUrlOrBlob: BASE + 'stockfish.js',
      }),
      fetch(BASE + NNUE).then((r) => r.arrayBuffer()),
    ])
    sf.FS.writeFile('/' + NNUE, new Uint8Array(net))
    const engine = new Engine(sf)
    const threads = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 2) - 1))
    for (const cmd of [
      'uci',
      `setoption name UCI_Variant value ${VARIANT}`,
      `setoption name EvalFile value /${NNUE}`,
      `setoption name Threads value ${threads}`,
      'setoption name Hash value 128',
    ])
      sf.postMessage(cmd)
    await engine.sync()
    return engine
  }

  private readyResolvers: (() => void)[] = []
  private sync() {
    return new Promise<void>((resolve) => {
      this.readyResolvers.push(resolve)
      this.sf.postMessage('isready')
    })
  }

  analyze(fen: string, cb: Callback, opts: { depth?: number; multiPv?: number } = {}) {
    this.pending = { fen, cb, depth: opts.depth ?? this.maxDepth, multiPv: opts.multiPv ?? 3 }
    if (this.state === 'searching') {
      this.state = 'stopping'
      this.sf.postMessage('stop')
    } else if (this.state === 'idle') {
      this.start()
    }
  }

  stop() {
    this.pending = null
    if (this.state === 'searching') {
      this.state = 'stopping'
      this.sf.postMessage('stop')
    }
  }

  private start() {
    const p = this.pending!
    this.pending = null
    this.current = { ...p, lines: [], depth: 0 }
    this.state = 'searching'
    if (p.multiPv !== this.multiPv) {
      this.multiPv = p.multiPv
      this.sf.postMessage(`setoption name MultiPV value ${p.multiPv}`)
    }
    this.sf.postMessage(`position fen ${p.fen}`)
    this.sf.postMessage(`go depth ${p.depth}`)
  }

  private onLine(line: string) {
    if (line === 'readyok') {
      this.readyResolvers.shift()?.()
      return
    }
    if (line.startsWith('bestmove')) {
      const cur = this.current
      const finished = this.state === 'searching'
      this.state = 'idle'
      this.current = null
      if (finished && cur) cur.cb({ fen: cur.fen, depth: cur.depth, lines: cur.lines.filter(Boolean), done: true })
      if (this.pending) this.start()
      return
    }
    const cur = this.current
    if (this.state !== 'searching' || !cur || !line.startsWith('info ') || !line.includes(' pv ')) return
    if (line.includes(' lowerbound') || line.includes(' upperbound')) return

    const tok = line.split(' ')
    const parsed: EngineLine = { multipv: 1, depth: 0, pv: [] }
    for (let i = 1; i < tok.length; i++) {
      const t = tok[i]
      if (t === 'depth') parsed.depth = +tok[++i]
      else if (t === 'multipv') parsed.multipv = +tok[++i]
      else if (t === 'score') {
        const kind = tok[++i]
        const v = +tok[++i]
        if (kind === 'cp') parsed.cp = v
        else parsed.mate = v
      } else if (t === 'pv') {
        parsed.pv = tok.slice(i + 1)
        break
      }
    }
    cur.lines[parsed.multipv - 1] = parsed
    if (parsed.multipv === 1) cur.depth = parsed.depth
    cur.cb({ fen: cur.fen, depth: cur.depth, lines: cur.lines.filter(Boolean), done: false })
  }
}

/** One fixed-depth search; resolves with the final lines. Never resolves if preempted. */
export function evaluate(engine: Engine, fen: string, depth: number, multiPv: number): Promise<Analysis> {
  return new Promise((resolve) => engine.analyze(fen, (a) => a.done && resolve(a), { depth, multiPv }))
}

let shared: Promise<Engine> | null = null
/** The page-wide engine instance (created on first use). */
export const getEngine = () => (shared ??= Engine.create())
