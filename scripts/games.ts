// Finished games from the site, for the research notes (persona 14): players as nick#tag, ratings, result,
// opening name and the moves in this site's notation. Opens the database read-only.
//   node scripts/games.ts [opening text to filter on] [max=20]
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { lineSan, loadRules } from '../src/janggi.ts'
import { classifyOpening } from '../src/openings.ts'

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
await loadRules({ wasmBinary: fs.readFileSync(path.join(ROOT, 'node_modules/ffish-es6/ffish.wasm')) } as never)
const [filter = '', max = '20'] = process.argv.slice(2)

const db = new DatabaseSync(path.join(ROOT, 'server/data/janggi.db'), { readOnly: true })
const rows = db
  .prepare(
    `SELECT g.id, g.start_fen, g.moves, g.result, g.reason, g.cho_rating, g.han_rating, g.ended,
            c.nick || '#' || c.tag AS cho, h.nick || '#' || h.tag AS han
       FROM games g JOIN users c ON c.id = g.cho_id JOIN users h ON h.id = g.han_id
      ORDER BY g.ended DESC`,
  )
  .all() as { id: string; start_fen: string; moves: string; result: string; reason: string; cho_rating: number; han_rating: number; ended: number; cho: string; han: string }[]

let shown = 0
for (const g of rows) {
  const moves = g.moves.split(' ').filter(Boolean)
  const opening = moves.length ? (classifyOpening(g.start_fen, moves)?.name ?? '') : ''
  if (filter && !opening.includes(filter)) continue
  const san = lineSan(g.start_fen, moves)
  console.log(`# ${g.id}  ${new Date(g.ended).toISOString().slice(0, 10)}  ${g.result} (${g.reason})`)
  console.log(`  초 ${g.cho} (${Math.round(g.cho_rating)})  한 ${g.han} (${Math.round(g.han_rating)})`)
  console.log(`  opening: ${opening || '-'}`)
  console.log(`  start: ${g.start_fen}`)
  console.log(`  uci: ${moves.join(' ')}`)
  console.log(`  san: ${san.map((s, i) => (i % 2 ? '' : `${i / 2 + 1}. `) + s).join(' ')}`)
  if (++shown >= +max) break
}
console.log(`(${shown} of ${rows.length} finished games)`)
