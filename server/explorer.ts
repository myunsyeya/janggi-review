// Opening explorer: for every position near the start of a game, which moves were played and how those games
// ended. Two sources, as lichess has "Masters" and "Lichess":
//   site     finished games on this site (first SITE_PLIES moves), built at startup and updated as games end
//   records  tournament records (대회 기보, server/records.ts), deeper (RECORD_PLIES) since there are few of them,
//            rebuilt whenever a record is added, fixed or removed; each position also lists the records that reached it
import type { DatabaseSync } from 'node:sqlite'
import { startFen, withBoard, type Setup } from '../src/janggi.ts'

const SITE_PLIES = 30
const RECORD_PLIES = 80
const GAME_LIST = 15

type Tally = { n: number; cho: number; draw: number; han: number }
type Index = Map<string, Map<string, Tally>>
const positionKey = (fen: string) => fen.split(' ').slice(0, 2).join(' ')

const site: Index = new Map()
let records: Index = new Map()
// position -> records that reached it, with the move played there (newest record first)
let recordGames = new Map<string, { id: string; uci: string; ply: number }[]>()
let recordInfo = new Map<string, Record<string, unknown>>()
let db: DatabaseSync

/** Walks a game's opening; calls visit(position key, move, ply) for each legal move */
function walk(start: string, moves: string[], plies: number, visit: (key: string, uci: string, ply: number) => void) {
  withBoard(start, (b) => {
    moves.slice(0, plies).every((uci, i) => {
      if (!b.legalMoves().split(' ').includes(uci)) return false
      visit(positionKey(b.fen()), uci, i + 1)
      b.push(uci)
      return true
    })
  })
}

function tally(index: Index, key: string, uci: string, result: string | null) {
  let next = index.get(key)
  if (!next) index.set(key, (next = new Map()))
  const t = next.get(uci) ?? { n: 0, cho: 0, draw: 0, han: 0 }
  t.n++
  if (result === '1-0') t.cho++
  else if (result === '0-1') t.han++
  else if (result === '1/2-1/2') t.draw++ // no result (some records): counted, not in the split
  next.set(uci, t)
}

/** A finished site game */
export function addSiteGame(start: string, moves: string[], result: string) {
  walk(start, moves, SITE_PLIES, (key, uci) => tally(site, key, uci, result))
}

/** Reads every tournament record again (called after any change to them) */
export function rebuildRecords() {
  const rows = db.prepare('SELECT * FROM records WHERE hidden = 0 ORDER BY created DESC').all() as Record<string, string>[]
  const index: Index = new Map()
  const lists = new Map<string, { id: string; uci: string; ply: number }[]>()
  const info = new Map<string, Record<string, unknown>>()
  for (const r of rows) {
    const start = startFen(r.cho_setup as Setup, r.han_setup as Setup)
    info.set(r.id, { id: r.id, cho: r.cho_name, han: r.han_name, event: r.event, round: r.round, date: r.date, result: r.result, reason: r.reason })
    walk(start, r.moves.split(' ').filter(Boolean), RECORD_PLIES, (key, uci, ply) => {
      tally(index, key, uci, r.result)
      let list = lists.get(key)
      if (!list) lists.set(key, (list = []))
      list.push({ id: r.id, uci, ply })
    })
  }
  records = index
  recordGames = lists
  recordInfo = info
}

export function initExplorer(database: DatabaseSync) {
  db = database
  for (const row of db.prepare('SELECT start_fen, moves, result FROM games').all() as { start_fen: string; moves: string; result: string }[])
    addSiteGame(row.start_fen, row.moves.split(' ').filter(Boolean), row.result)
  rebuildRecords()
  console.log(`explorer: ${site.size} positions from site games, ${records.size} from tournament records`)
}

/** GET /api/explorer?fen=…&source=site|records */
export function explore(fen: string, source: string) {
  const key = positionKey(fen)
  const index = source === 'records' ? records : site
  const moves = [...(index.get(key) ?? new Map<string, Tally>())].map(([uci, t]) => ({ uci, ...t })).sort((a, b) => b.n - a.n)
  const total = moves.reduce((s, m) => s + m.n, 0)
  if (source !== 'records') return { moves, total }
  const games = (recordGames.get(key) ?? []).slice(0, GAME_LIST).map((g) => ({ ...recordInfo.get(g.id), next: g.uci, ply: g.ply }))
  return { moves, total, games }
}
