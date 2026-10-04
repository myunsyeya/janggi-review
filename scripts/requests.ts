// Tournament records (대회 기보) for the research notes: games people entered on the site that have no study yet.
// Their game review already works on the site; the researcher writes the study. Opens the database read-only.
//   node scripts/requests.ts          records without a study, oldest first, with the game
//   node scripts/requests.ts all      also the answered ones (one line each)
import fs from 'node:fs'
import path from 'node:path'
import { lineSan, loadRules, startFen } from '../src/janggi.ts'
import { headers, loadRecords } from './requestLib.ts'
import { ROOT } from './sf.ts'

await loadRules({ wasmBinary: fs.readFileSync(path.join(ROOT, 'node_modules/ffish-es6/ffish.wasm')) } as never)
const all = process.argv[2] === 'all'
const records = loadRecords()
const open = records.filter((r) => !r.answeredBy)
if (all) for (const r of records.filter((x) => x.answeredBy)) console.log(`answered ${r.id} → content/studies/${r.answeredBy}`)
if (!open.length) {
  console.log('no open records')
  process.exit(0)
}
console.log(`${open.length} open record(s)\n`)
for (const r of open) {
  const sans = lineSan(startFen(r.cho, r.han), r.moves)
  console.log(`=== record ${r.id} (entered by ${r.submitter}, ${r.created}) — review: https://myunsyeya.com/analysis?record=${r.id}`)
  console.log(`초 ${r.choName} (${r.cho}) vs 한 ${r.hanName} (${r.han})`)
  console.log(`event: ${r.event} | round: ${r.round || '-'} | date: ${r.date || '-'} | result: ${r.result ?? '-'} ${r.reason}`)
  if (r.source) console.log(`source: ${r.source}`)
  if (r.note) console.log(`note from the submitter: ${r.note}`)
  console.log(`moves (${r.moves.length} plies): ${sans.map((s, i) => (i % 2 ? '' : `${i / 2 + 1}. `) + s).join(' ')}`)
  console.log(`uci: ${r.moves.join(' ')}`)
  console.log(`scan: node scripts/gamecheck.ts ${r.id}`)
  console.log('chapter headers:')
  console.log(`[Cho "${r.cho}"]\n[Han "${r.han}"]\n${headers(r)}`)
  console.log()
}
process.exit(0)
