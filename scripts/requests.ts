// Game-analysis requests for the research notes: games entered on the site (study editor → 분석 맡기기) that the
// hourly researcher should analyse. Opens the database read-only.
//   node scripts/requests.ts          requests not answered yet, oldest first, with the game
//   node scripts/requests.ts all      also the answered ones (one line each)
import fs from 'node:fs'
import path from 'node:path'
import { lineSan, loadRules, startFen } from '../src/janggi.ts'
import { loadRequests, mainLine } from './requestLib.ts'
import { ROOT } from './sf.ts'

await loadRules({ wasmBinary: fs.readFileSync(path.join(ROOT, 'node_modules/ffish-es6/ffish.wasm')) } as never)
const all = process.argv[2] === 'all'
const requests = loadRequests()
const open = requests.filter((r) => !r.answeredBy)
if (all) for (const r of requests.filter((x) => x.answeredBy)) console.log(`answered ${r.key} → content/studies/${r.answeredBy}`)
if (!open.length) {
  console.log('no open requests')
  process.exit(0)
}
for (const r of open) {
  const ch = r.chapter
  const moves = mainLine(ch)
  const sans = lineSan(startFen(ch.cho, ch.han), moves)
  const g = ch.game ?? {}
  console.log(`=== request ${r.key} (from ${r.requester}, ${r.created})`)
  console.log(`event: ${g.event ?? '-'} | date: ${g.date ?? '-'} | round: ${g.round ?? '-'}`)
  console.log(`초 ${g.cho ?? '?'} (${ch.cho}) vs 한 ${g.han ?? '?'} (${ch.han}) | result: ${g.result ?? '-'}`)
  if (g.source) console.log(`source: ${g.source}`)
  if (r.note) console.log(`note: ${r.note}`)
  console.log(`moves (${moves.length} plies): ${sans.map((s, i) => (i % 2 ? '' : `${i / 2 + 1}. `) + s).join(' ')}`)
  console.log(`uci: ${moves.join(' ')}`)
  console.log(`scan: node scripts/gamecheck.ts ${r.key}`)
  console.log('--- as entered:')
  console.log(r.pgn.trim())
  console.log()
}
process.exit(0)
