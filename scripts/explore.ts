// Engine exploration for the research notes: MultiPV lines from a position, in this site's notation.
//   node scripts/explore.ts <cho setup> <han setup> "<uci moves …>" [depth=16] [multipv=5]
// Scores are from 초's side (+ = 초 better), so lines from either side read the same way.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { lineSan, loadRules, startFen, withBoard } from '../src/janggi.ts'
import { classifyOpening } from '../src/openings.ts'

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
await loadRules({ wasmBinary: fs.readFileSync(path.join(ROOT, 'node_modules/ffish-es6/ffish.wasm')) } as never)
const [cho, han, movesArg = '', depth = '16', mpv = '5'] = process.argv.slice(2)
if (!cho || !han) {
  console.error('usage: node scripts/explore.ts <cho setup> <han setup> "<uci moves>" [depth] [multipv]')
  process.exit(2)
}
const moves = movesArg.split(/[\s,]+/).filter(Boolean)
const start = startFen(cho as never, han as never)
const fen = withBoard(start, (b) => {
  for (const m of moves) {
    if (!b.legalMoves().split(' ').includes(m)) throw new Error(`illegal move ${m} at ${b.fen()}`)
    b.push(m)
  }
  return b.fen()
})

const D = path.join(ROOT, 'node_modules/fairy-stockfish-nnue.wasm') + '/'
const nnue = fs.readdirSync(path.join(ROOT, 'public/engine')).find((f) => f.endsWith('.nnue'))!
const sf = await createRequire(import.meta.url)(D + 'stockfish.js')({
  wasmBinary: fs.readFileSync(D + 'stockfish.wasm'),
  locateFile: (f: string) => D + f,
  mainScriptUrlOrBlob: D + 'stockfish.js',
})
sf.FS.writeFile('/j.nnue', fs.readFileSync(path.join(ROOT, 'public/engine', nnue)))
const lines = new Map<number, { depth: number; kind: string; v: number; pv: string[] }>()
await new Promise<void>((done) => {
  sf.addMessageListener((l: string) => {
    const m = / depth (\d+) .*multipv (\d+) score (cp|mate) (-?\d+).* pv (.*)$/.exec(l)
    if (m && !l.includes('bound')) lines.set(+m[2], { depth: +m[1], kind: m[3], v: +m[4], pv: m[5].split(' ') })
    if (l.startsWith('bestmove')) done()
  })
  for (const c of [
    'setoption name UCI_Variant value janggimodern',
    'setoption name EvalFile value /j.nnue',
    `setoption name MultiPV value ${mpv}`,
    'setoption name Hash value 64',
    `position fen ${fen}`,
    `go depth ${depth}`,
  ])
    sf.postMessage(c)
})
const choToMove = fen.split(' ')[1] === 'w'
const sans = lineSan(start, moves)
console.log('line:', sans.map((s, i) => (i % 2 ? '' : `${i / 2 + 1}. `) + s).join(' ') || '(start)')
console.log('opening:', moves.length ? (classifyOpening(start, moves)?.name ?? '-') : '-', '| to move:', choToMove ? '초' : '한')
for (const [k, l] of [...lines].sort((a, b) => a[0] - b[0])) {
  const score = l.kind === 'mate' ? `M${l.v}` : (((choToMove ? 1 : -1) * l.v) / 100).toFixed(2)
  console.log(`  #${k} [${score} 초기준 d${l.depth}] ${l.pv[0]} ${lineSan(fen, l.pv.slice(0, 10)).join(' ')}`)
}
process.exit(0)
