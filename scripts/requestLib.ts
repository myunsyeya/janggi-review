// Tournament records (대회 기보, server/records.ts) as the research scripts read them: straight from the site
// database, read-only. A record is answered once an official study's study.json says "record": "<record id>".
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Setup } from '../src/janggi.ts'
import { ROOT } from './sf.ts'

export interface TournamentRecord {
  id: string
  submitter: string
  created: string
  cho: Setup
  han: Setup
  moves: string[]
  choName: string
  hanName: string
  event: string
  round: string
  date: string
  result: string | null
  reason: string
  source: string
  note: string
  answeredBy?: string // official study folder
}

/** Official studies by the record they analyse */
export function answers(): Record<string, string> {
  const dir = path.join(ROOT, 'content/studies')
  const out: Record<string, string> = {}
  for (const id of fs.readdirSync(dir)) {
    const f = path.join(dir, id, 'study.json')
    if (!fs.existsSync(f)) continue
    const rec = (JSON.parse(fs.readFileSync(f, 'utf8')) as { record?: string }).record
    if (rec) out[rec] = id
  }
  return out
}

/** All records that are not hidden, oldest first */
export function loadRecords(): TournamentRecord[] {
  const db = new DatabaseSync(path.join(process.env.JANGGI_DATA ?? path.join(ROOT, 'server/data'), 'janggi.db'), { readOnly: true })
  const has = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'records'").get()
  if (!has) return []
  const rows = db
    .prepare(
      `SELECT r.*, COALESCE(u.nick || '#' || u.tag, '(탈퇴한 사용자)') AS submitter
         FROM records r LEFT JOIN users u ON u.id = r.submitter_id
        WHERE r.hidden = 0 ORDER BY r.created`,
    )
    .all() as Record<string, string & number>[]
  const done = answers()
  return rows.map((r) => ({
    id: r.id,
    submitter: r.submitter,
    created: new Date(r.created).toISOString().slice(0, 10),
    cho: r.cho_setup as Setup,
    han: r.han_setup as Setup,
    moves: r.moves.split(' ').filter(Boolean),
    choName: r.cho_name,
    hanName: r.han_name,
    event: r.event,
    round: r.round,
    date: r.date,
    result: r.result,
    reason: r.reason,
    source: r.source,
    note: r.note,
    answeredBy: done[r.id],
  }))
}

/** Game headers for a chapter about this record (study files keep them in every chapter) */
export function headers(r: TournamentRecord) {
  const result = r.result === '1-0' ? '초 승' : r.result === '0-1' ? '한 승' : r.result ? '무승부' : ''
  const tags: [string, string][] = [
    ['Event', r.event],
    ['Date', r.date],
    ['Round', r.round],
    ['ChoPlayer', r.choName],
    ['HanPlayer', r.hanName],
    ['Result', [result, r.reason].filter(Boolean).join(' · ')],
    ['Source', r.source],
  ]
  return tags
    .filter(([, v]) => v)
    .map(([k, v]) => `[${k} "${v.replace(/"/g, "'")}"]`)
    .join('\n')
}
