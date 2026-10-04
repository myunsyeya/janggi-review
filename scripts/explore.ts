// Engine exploration for the research notes: MultiPV lines from a position, in this site's notation.
//   node scripts/explore.ts <cho setup> <han setup> "<uci moves …>" [depth=16] [multipv=5]
// Scores are from 초's side (+ = 초 better), so lines from either side read the same way.
import { gameKeys, lineSan, startFen, withBoard } from '../src/janggi.ts'
import { classifyOpening } from '../src/openings.ts'
import { openEngine } from './sf.ts'

const [cho, han, movesArg = '', depth = '16', mpv = '5'] = process.argv.slice(2)
if (!cho || !han) {
  console.error('usage: node scripts/explore.ts <cho setup> <han setup> "<uci moves>" [depth] [multipv]')
  process.exit(2)
}
const { search } = await openEngine({ multipv: +mpv })
const moves = movesArg.split(/[\s,]+/).filter(Boolean)
const start = startFen(cho as never, han as never)
const fen = withBoard(start, (b) => {
  for (const m of moves) {
    if (!b.legalMoves().split(' ').includes(m)) throw new Error(`illegal move ${m} at ${b.fen()}`)
    b.push(m)
  }
  return b.fen()
})

// the engine gets the moves too (up to the last capture), so it knows the repetition rules
const lines = await search(gameKeys(start, moves).at(-1)!, +depth)
const choToMove = fen.split(' ')[1] === 'w'
const sans = lineSan(start, moves)
console.log('line:', sans.map((s, i) => (i % 2 ? '' : `${i / 2 + 1}. `) + s).join(' ') || '(start)')
console.log('opening:', moves.length ? (classifyOpening(start, moves)?.name ?? '-') : '-', '| to move:', choToMove ? '초' : '한')
lines.forEach((l, k) => {
  const score = l.kind === 'mate' ? `M${l.v}` : (((choToMove ? 1 : -1) * l.v) / 100).toFixed(2)
  console.log(`  #${k + 1} [${score} 초기준 d${l.depth}] ${l.pv[0]} ${lineSan(fen, l.pv.slice(0, 10)).join(' ')}`)
})
process.exit(0)
