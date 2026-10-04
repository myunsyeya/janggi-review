// Engine pass over a whole game for the research notes: every move's value against the engine's best, in the
// allowance bands of research/personas.md, then the turning points. Scores are from 초's side.
//   node scripts/gamecheck.ts <record id> [depth=18]          a tournament record (scripts/requests.ts)
//   node scripts/gamecheck.ts <cho setup> <han setup> "<uci moves>" [depth=18]
// A move's loss = best value of the position before it − value after it, both for the side that moved.
// Losses under 0.4 wobble at this depth: check every turning point again with explore.ts before writing it.
import { gameKeys, keyResult, lineSan, startFen, withBoard } from '../src/janggi.ts'
import { classifyOpening } from '../src/openings.ts'
import { loadRecords } from './requestLib.ts'
import { openEngine, type Line } from './sf.ts'

const args = process.argv.slice(2)
const { search } = await openEngine({ threads: 4, hash: 128 })
let cho: string, han: string, moves: string[], depth: number
if (/^r-[a-z0-9]{8}$/.test(args[0] ?? '')) {
  const r = loadRecords().find((x) => x.id === args[0])
  if (!r) throw new Error(`no record ${args[0]}`)
  ;({ cho, han, moves } = r)
  depth = +(args[1] ?? 18)
} else {
  if (args.length < 3) {
    console.error('usage: node scripts/gamecheck.ts <record id> [depth] | <cho> <han> "<uci moves>" [depth]')
    process.exit(2)
  }
  ;[cho, han] = args
  moves = args[2].split(/[\s,]+/).filter(Boolean)
  depth = +(args[3] ?? 18)
}
const start = startFen(cho as never, han as never)
const fens = withBoard(start, (b) => [
  start,
  ...moves.map((m) => {
    if (!b.legalMoves().split(' ').includes(m)) throw new Error(`illegal move ${m} at ${b.fen()}`)
    b.push(m)
    return b.fen()
  }),
])
const sans = lineSan(start, moves)

// value for the side to move, in pawns; mates count as ±30
const CAP = 30
const value = (l: Line | undefined) => (!l ? -CAP : l.kind === 'mate' ? Math.sign(l.v || -1) * CAP : Math.max(-CAP, Math.min(CAP, l.v / 100)))
const results: { best: Line | undefined; v: number }[] = []
const keys = gameKeys(start, moves) // FEN plus recent moves, so the engine knows the repetition rules
for (const [i, fen] of fens.entries()) {
  const over = keyResult(keys[i])?.result
  if (over) {
    const toMove = fen.split(' ')[1] === 'w' ? '1-0' : '0-1'
    results.push({ best: undefined, v: over === '1/2-1/2' ? 0 : over === toMove ? CAP : -CAP })
    continue
  }
  const [best] = await search(keys[i], depth)
  results.push({ best, v: value(best) })
}

const band = (loss: number) => (loss <= 0.15 ? '동등' : loss <= 0.4 ? '허용' : loss <= 0.8 ? '도박' : '실수')
const cho1 = (i: number, v: number) => (i % 2 ? -v : v) // position i's side-to-move value → 초's side
const fmt = (v: number) => (Math.abs(v) >= CAP ? (v > 0 ? '+M' : '-M') : (v >= 0 ? '+' : '') + v.toFixed(2))
console.log(`game: 초 ${cho} vs 한 ${han}, ${moves.length} plies, depth ${depth}`)
console.log(`opening: ${moves.length ? (classifyOpening(start, moves)?.name ?? '-') : '-'}`)
console.log('ply  move        before → after (초 기준)   best                loss  band')
const turning: { i: number; loss: number }[] = []
for (let i = 0; i < moves.length; i++) {
  const before = results[i]
  const after = results[i + 1]
  const played = moves[i]
  const bestUci = before.best?.pv[0]
  const loss = bestUci === played ? 0 : Math.max(0, before.v - -after.v)
  const no = `${Math.floor(i / 2) + 1}${i % 2 ? '...' : '.'}`
  const bestSan = bestUci && bestUci !== played ? lineSan(fens[i], [bestUci])[0] : ''
  console.log(
    `${String(i + 1).padStart(3)}  ${(no + ' ' + sans[i]).padEnd(11)} ${fmt(cho1(i, before.v)).padStart(6)} → ${fmt(cho1(i + 1, after.v)).padStart(6)}   ${bestSan.padEnd(18)}  ${loss.toFixed(2).padStart(5)}  ${band(loss)}`,
  )
  if (loss > 0.4) turning.push({ i, loss })
}
console.log(`\nturning points (loss > 0.40): ${turning.length}, the 12 biggest first; uci up to the position before the move, then the engine line:`)
for (const { i, loss } of turning.sort((a, b) => b.loss - a.loss).slice(0, 12)) {
  const no = `${Math.floor(i / 2) + 1}${i % 2 ? '...' : '.'}`
  const best = results[i].best!
  console.log(`  ${no} ${sans[i]} (loss ${loss.toFixed(2)}) — engine: ${lineSan(fens[i], best.pv.slice(0, 8)).join(' ')}`)
  console.log(`    explore: node scripts/explore.ts ${cho} ${han} "${moves.slice(0, i).join(' ')}" 20 8`)
}
process.exit(0)
