// Fairy-Stockfish (NNUE, WASM) for the research scripts: one engine, searched one position at a time.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { loadRules } from '../src/janggi.ts'

export const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..')

export interface Line {
  depth: number
  kind: 'cp' | 'mate'
  v: number // side to move's view
  pv: string[]
}

export async function openEngine(opts: { multipv?: number; threads?: number; hash?: number } = {}) {
  await loadRules({ wasmBinary: fs.readFileSync(path.join(ROOT, 'node_modules/ffish-es6/ffish.wasm')) } as never)
  const D = path.join(ROOT, 'node_modules/fairy-stockfish-nnue.wasm') + '/'
  const nnue = fs.readdirSync(path.join(ROOT, 'public/engine')).find((f) => f.endsWith('.nnue'))!
  const sf = await createRequire(import.meta.url)(D + 'stockfish.js')({
    wasmBinary: fs.readFileSync(D + 'stockfish.wasm'),
    locateFile: (f: string) => D + f,
    mainScriptUrlOrBlob: D + 'stockfish.js',
  })
  sf.FS.writeFile('/j.nnue', fs.readFileSync(path.join(ROOT, 'public/engine', nnue)))
  let onLine: ((l: string) => void) | null = null
  sf.addMessageListener((l: string) => onLine?.(l))
  for (const c of [
    'setoption name UCI_Variant value janggimodern',
    'setoption name EvalFile value /j.nnue',
    `setoption name MultiPV value ${opts.multipv ?? 1}`,
    `setoption name Threads value ${opts.threads ?? 1}`,
    `setoption name Hash value ${opts.hash ?? 64}`,
  ])
    sf.postMessage(c)

  /** MultiPV lines of one position, best first (empty when the side to move has no moves) */
  const search = (fen: string, depth: number) =>
    new Promise<Line[]>((done) => {
      const lines = new Map<number, Line>()
      onLine = (l) => {
        const m = / depth (\d+) .*multipv (\d+) score (cp|mate) (-?\d+).* pv (.*)$/.exec(l)
        if (m && !l.includes('bound')) lines.set(+m[2], { depth: +m[1], kind: m[3] as Line['kind'], v: +m[4], pv: m[5].split(' ') })
        if (l.startsWith('bestmove')) {
          onLine = null
          done([...lines].sort((a, b) => a[0] - b[0]).map(([, x]) => x))
        }
      }
      sf.postMessage(`position fen ${fen}`)
      sf.postMessage(`go depth ${depth}`)
    })
  return { search }
}
