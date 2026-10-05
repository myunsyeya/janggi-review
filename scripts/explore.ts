// Engine exploration for the research notes: MultiPV lines from a position, in this site's notation.
//   node scripts/explore.ts <cho setup> <han setup> "<uci moves …>" [depth=16] [multipv=5] [--each]
// Several positions in one run (one engine, no shell loop needed): separate the move lists with "|", e.g.
//   node scripts/explore.ts 마상마상 상마상마 "i4h4 | a4b4 | g1f3" 20 8
// --each: after the MultiPV search, measure the position after each candidate move on its own at the same depth
// (how replies are compared, see research/PROMPT.md).
// Scores are from 초's side (+ = 초 better), so lines from either side read the same way.
import { gameKeys, lineSan, startFen, withBoard } from '../src/janggi.ts'
import { classifyOpening } from '../src/openings.ts'
import { openEngine, type Line } from './sf.ts'

const args = process.argv.slice(2)
const each = args.includes('--each')
const [cho, han, movesArg = '', depth = '16', mpv = '5'] = args.filter((a) => a !== '--each')
if (!cho || !han) {
  console.error('usage: node scripts/explore.ts <cho setup> <han setup> "<uci moves>[ | <uci moves> …]" [depth] [multipv] [--each]')
  process.exit(2)
}
const { search } = await openEngine({ multipv: +mpv })
const start = startFen(cho as never, han as never)

const score = (fen: string, l: Line) => (l.kind === 'mate' ? `M${l.v}` : (((fen.split(' ')[1] === 'w' ? 1 : -1) * l.v) / 100).toFixed(2))

for (const [n, part] of movesArg.split('|').entries()) {
  const moves = part.split(/[\s,]+/).filter(Boolean)
  const fen = withBoard(start, (b) => {
    for (const m of moves) {
      if (!b.legalMoves().split(' ').includes(m)) throw new Error(`illegal move ${m} at ${b.fen()}`)
      b.push(m)
    }
    return b.fen()
  })
  if (n) console.log()
  // the engine gets the moves too (up to the last capture), so it knows the repetition rules
  const lines = await search(gameKeys(start, moves).at(-1)!, +depth)
  const sans = lineSan(start, moves)
  console.log('line:', sans.map((s, i) => (i % 2 ? '' : `${i / 2 + 1}. `) + s).join(' ') || '(start)')
  console.log('opening:', moves.length ? (classifyOpening(start, moves)?.name ?? '-') : '-', '| to move:', fen.split(' ')[1] === 'w' ? '초' : '한')
  lines.forEach((l, k) => console.log(`  #${k + 1} [${score(fen, l)} 초기준 d${l.depth}] ${l.pv[0]} ${lineSan(fen, l.pv.slice(0, 10)).join(' ')}`))
  if (each) {
    console.log(`  each candidate on its own (position after it, depth ${depth}):`)
    for (const l of lines) {
      const after = [...moves, l.pv[0]]
      const afterFen = withBoard(fen, (b) => (b.push(l.pv[0]), b.fen()))
      const [best] = await search(gameKeys(start, after).at(-1)!, +depth)
      console.log(`    ${lineSan(fen, [l.pv[0]])[0].padEnd(6)} ${best ? score(afterFen, best) : '(game over)'}`)
    }
  }
}
process.exit(0)
