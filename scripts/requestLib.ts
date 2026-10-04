// Game-analysis requests (the 분석 맡기기 button in the study editor) as the research scripts read them:
// straight from the site database, read-only. A request is answered once an official study's study.json
// says "request": "<study id>/<chapter id>".
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { parseChapter, type StudyChapter } from '../src/studyFormat.ts'
import { ROOT } from './sf.ts'

export interface Request {
  key: string // "<study id>/<chapter id>"
  requester: string
  note: string
  created: string
  pgn: string
  chapter: StudyChapter
  answeredBy?: string // official study folder
}

/** Official studies by the request they answer */
export function answers(): Record<string, string> {
  const dir = path.join(ROOT, 'content/studies')
  const out: Record<string, string> = {}
  for (const id of fs.readdirSync(dir)) {
    const f = path.join(dir, id, 'study.json')
    if (!fs.existsSync(f)) continue
    const req = (JSON.parse(fs.readFileSync(f, 'utf8')) as { request?: string }).request
    if (req) out[req] = id
  }
  return out
}

export function loadRequests(): Request[] {
  const db = new DatabaseSync(path.join(process.env.JANGGI_DATA ?? path.join(ROOT, 'server/data'), 'janggi.db'), { readOnly: true })
  const has = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'study_requests'").get()
  if (!has) return []
  const rows = db
    .prepare(
      `SELECT r.study_id, r.chapter_id, r.note, r.created, s.chapters, u.nick || '#' || u.tag AS requester
         FROM study_requests r JOIN user_studies s ON s.id = r.study_id JOIN users u ON u.id = r.requester_id
        ORDER BY r.created`,
    )
    .all() as { study_id: string; chapter_id: string; note: string; created: number; chapters: string; requester: string }[]
  const done = answers()
  const out: Request[] = []
  for (const r of rows) {
    const stored = (JSON.parse(r.chapters) as { id: string; pgn: string }[]).find((c) => c.id === r.chapter_id)
    if (!stored) continue // the chapter was deleted since
    const key = `${r.study_id}/${r.chapter_id}`
    out.push({
      key,
      requester: r.requester,
      note: r.note,
      created: new Date(r.created).toISOString().slice(0, 10),
      pgn: stored.pgn,
      chapter: parseChapter(stored.pgn, r.chapter_id),
      answeredBy: done[key],
    })
  }
  return out
}

/** The main line of a chapter as uci moves */
export function mainLine(ch: StudyChapter): string[] {
  const moves: string[] = []
  for (let n = ch.root.ch[0]; n; n = n.ch[0]) moves.push(n.uci!)
  return moves
}
