// Server-side game review: one Fairy-Stockfish (WASM) instance works through a queue of positions and stores
// each result in position_evals, so a position is analysed once for every game that reaches it the same way.
// Positions are keyed by engineKey (src/janggi.ts): the FEN plus the moves since the last capture (at most a few),
// which the engine is given too, so it knows the repetition rules; the column is still called fen.
//   - live games: every new position is queued at low priority while the game goes on, so most of a game is
//     already analysed when it ends. Nothing about a live game is ever served (GET only answers finished games).
//   - finished games: all their positions are queued at high priority.
// Results have the browser review's shape (PosEval, side-to-move scores) and depth, so both give the same review.
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { choToMove, engineKey, gameKeys, keyResult, replay } from '../src/janggi.ts'

export const REVIEW_DEPTH = 16 // keep in step with src/review.ts
export const REVIEW_MULTIPV = 2

interface EngineLine {
  multipv: number
  depth: number
  cp?: number
  mate?: number
  pv: string[]
}
export interface PosEval {
  lines: EngineLine[]
  terminal?: number
}

let db: DatabaseSync
const urgent: string[] = []
const live: string[] = []
const queued = new Set<string>()
let running = false
let sf: { postMessage(cmd: string): void; addMessageListener(f: (line: string) => void): void } | null = null
let onLine: ((line: string) => void) | null = null

export async function initAnalysis(database: DatabaseSync, root: string) {
  db = database
  db.exec(`
    CREATE TABLE IF NOT EXISTS position_evals (
      fen TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created INTEGER NOT NULL
    );
  `)
  const dir = path.join(root, 'node_modules/fairy-stockfish-nnue.wasm') + '/'
  const engineDir = path.join(root, 'public/engine')
  const nnue = fs.readdirSync(engineDir).find((f) => f.endsWith('.nnue'))!
  sf = await createRequire(import.meta.url)(dir + 'stockfish.js')({
    wasmBinary: fs.readFileSync(dir + 'stockfish.wasm'),
    locateFile: (f: string) => dir + f,
    mainScriptUrlOrBlob: dir + 'stockfish.js',
  })
  ;(sf as unknown as { FS: { writeFile(p: string, d: Buffer): void } }).FS.writeFile('/' + nnue, fs.readFileSync(path.join(engineDir, nnue)))
  sf!.addMessageListener((l) => onLine?.(l))
  for (const c of [
    'setoption name UCI_Variant value janggimodern',
    `setoption name EvalFile value /${nnue}`,
    'setoption name Threads value 3', // of 10 cores: the rest stay with the live games and the site
    'setoption name Hash value 64',
    `setoption name MultiPV value ${REVIEW_MULTIPV}`,
  ])
    sf!.postMessage(c)
}

const stored = (fen: string) => {
  const row = db.prepare('SELECT data FROM position_evals WHERE fen = ?').get(fen) as { data: string } | undefined
  return row ? (JSON.parse(row.data) as PosEval) : undefined
}

/** A finished position needs no engine: its result, as expected points for the side to move. */
function terminal(key: string): PosEval | undefined {
  const end = keyResult(key)
  if (!end) return undefined
  const { result, fen } = end
  const cho = result === '1-0' ? 1 : result === '0-1' ? 0 : 0.5
  return { lines: [], terminal: choToMove(fen) ? cho : 1 - cho }
}

function analyse(fen: string): Promise<PosEval> {
  return new Promise((resolve) => {
    const lines: EngineLine[] = []
    onLine = (l) => {
      if (l.startsWith('info ') && l.includes(' pv ') && !l.includes('bound')) {
        const tok = l.split(' ')
        const line: EngineLine = { multipv: 1, depth: 0, pv: [] }
        for (let i = 1; i < tok.length; i++) {
          const t = tok[i]
          if (t === 'depth') line.depth = +tok[++i]
          else if (t === 'multipv') line.multipv = +tok[++i]
          else if (t === 'score') {
            const kind = tok[++i]
            const v = +tok[++i]
            if (kind === 'cp') line.cp = v
            else line.mate = v
          } else if (t === 'pv') {
            line.pv = tok.slice(i + 1)
            break
          }
        }
        lines[line.multipv - 1] = line
      } else if (l.startsWith('bestmove')) {
        onLine = null
        resolve({ lines: lines.filter(Boolean) })
      }
    }
    sf!.postMessage(`position fen ${fen}`) // a key: "<fen>" or "<fen> moves <…>"
    sf!.postMessage(`go depth ${REVIEW_DEPTH}`)
  })
}

async function work() {
  if (running || !sf) return
  running = true
  try {
    for (;;) {
      const fen = urgent.shift() ?? live.shift()
      if (!fen) break
      queued.delete(fen)
      if (stored(fen) || terminal(fen)) continue
      const e = await analyse(fen)
      db.prepare('INSERT OR REPLACE INTO position_evals (fen, data, created) VALUES (?, ?, ?)').run(fen, JSON.stringify(e), Date.now())
    }
  } catch (e) {
    console.error('analysis:', e)
  } finally {
    running = false
  }
}

function enqueue(fens: string[], high: boolean) {
  for (const fen of fens) {
    if (queued.has(fen)) {
      // already waiting: a finished game moves it to the front
      if (high && live.includes(fen)) live.splice(live.indexOf(fen), 1), urgent.push(fen)
      continue
    }
    if (stored(fen) || terminal(fen)) continue
    queued.add(fen)
    ;(high ? urgent : live).push(fen)
  }
  void work()
}

/** The newest position of a live game (analysed in the background, never shown before the game ends) */
export const analyseLive = (start: string, moves: string[]) => enqueue([moves.length ? engineKey(start, replay(start, moves)) : start], false)

/** A finished game: queue what is missing and report what is ready (by key, see src/janggi.ts gameKeys) */
export function gameAnalysis(start: string, moves: string[]) {
  const fens = gameKeys(start, moves)
  const evals: Record<string, PosEval> = {}
  const missing: string[] = []
  for (const fen of fens) {
    const e = stored(fen) ?? terminal(fen)
    if (e) evals[fen] = e
    else missing.push(fen)
  }
  if (missing.length) enqueue(missing, true)
  const unique = new Set(fens).size
  return { total: unique, done: Object.keys(evals).length, evals }
}
