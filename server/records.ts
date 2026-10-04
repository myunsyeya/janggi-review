// Tournament records (대회 기보): games played elsewhere (tournaments, broadcasts) that anyone logged in can enter on
// the analysis board. They are treated like finished site games: the server analyses every position right away
// (server/analysis.ts), so the game review (advantage graph, move classes) opens like any other game's.
// The hourly researcher later writes an official study about each record (scripts/requests.ts lists the ones
// without one); a study answers a record with "record": "<id>" in its study.json.
import crypto from 'node:crypto'
import fs from 'node:fs'
import type http from 'node:http'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { SETUPS, startFen, withBoard, type Setup } from '../src/janggi.ts'
import { gameAnalysis } from './analysis.ts'
import { rebuildRecords } from './explorer.ts'

const PER_DAY = 10 // records one account may enter per day
const MIN_PLIES = 10
const MAX_PLIES = 600
const RESULTS = ['1-0', '0-1', '1/2-1/2']

export interface RecordDeps {
  db: DatabaseSync
  user: (auth: string | undefined) => { id: number; nick: string; tag: string } | undefined
  json: (res: http.ServerResponse, status: number, body: unknown) => void
  readBody: (req: http.IncomingMessage, limit?: number) => Promise<Record<string, unknown>>
  dist: string
  dataDir: string
}

interface Row {
  id: string
  submitter_id: number
  cho_setup: Setup
  han_setup: Setup
  moves: string
  cho_name: string
  han_name: string
  event: string
  round: string
  date: string
  result: string | null
  reason: string
  source: string
  note: string
  created: number
  hidden: number
}

export function initRecords(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      submitter_id INTEGER NOT NULL,
      cho_setup TEXT NOT NULL,
      han_setup TEXT NOT NULL,
      moves TEXT NOT NULL,
      cho_name TEXT NOT NULL,
      han_name TEXT NOT NULL,
      event TEXT NOT NULL DEFAULT '',
      round TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      result TEXT,
      reason TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      created INTEGER NOT NULL,
      hidden INTEGER NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS records_game ON records(cho_setup, han_setup, moves);
    DROP TABLE IF EXISTS study_requests;
  `)
}

const isAdmin = (d: RecordDeps, u: { nick: string; tag: string } | undefined) => {
  if (!u) return false
  try {
    return fs.readFileSync(path.join(d.dataDir, 'admins.txt'), 'utf8').split('\n').map((l) => l.trim()).includes(`${u.nick}#${u.tag}`)
  } catch {
    return false
  }
}

/** Official studies (built) by the record they analyse */
function studies(d: RecordDeps): Record<string, { id: string; title: string }> {
  try {
    const index = JSON.parse(fs.readFileSync(path.join(d.dist, 'studies/index.json'), 'utf8')) as { id: string; title: string; record?: string }[]
    return Object.fromEntries(index.filter((s) => s.record).map((s) => [s.record!, { id: s.id, title: s.title }]))
  } catch {
    return {}
  }
}

function submitter(d: RecordDeps, id: number) {
  const u = d.db.prepare('SELECT nick, tag FROM users WHERE id = ?').get(id) as { nick: string; tag: string } | undefined
  return u ? `${u.nick}#${u.tag}` : '(탈퇴한 사용자)'
}

function summary(d: RecordDeps, r: Row, study?: { id: string; title: string }) {
  return {
    id: r.id,
    cho: r.cho_name,
    han: r.han_name,
    choSetup: r.cho_setup,
    hanSetup: r.han_setup,
    event: r.event,
    round: r.round,
    date: r.date,
    result: r.result,
    reason: r.reason,
    source: r.source,
    plies: r.moves.split(' ').filter(Boolean).length,
    submitter: submitter(d, r.submitter_id),
    created: r.created,
    study: study?.id,
  }
}

const text = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/** The fields people may write about a record (also used to fix typos later) */
function info(body: Record<string, unknown>) {
  const date = text(body.date, 10)
  const source = text(body.source, 300)
  const result = RESULTS.includes(String(body.result)) ? String(body.result) : null
  return {
    cho_name: text(body.choName, 30),
    han_name: text(body.hanName, 30),
    event: text(body.event, 60),
    round: text(body.round, 30),
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
    result,
    reason: text(body.reason, 30),
    source: /^https?:\/\/\S+$/.test(source) ? source : '',
    note: text(body.note, 500),
  }
}

/** Handles /api/records…; returns false if the path is not ours */
export async function handleRecords(d: RecordDeps, req: http.IncomingMessage, res: http.ServerResponse, url: URL, auth?: string) {
  const { db, json } = d
  const p = url.pathname
  if (!p.startsWith('/api/records')) return false
  const me = d.user(auth)

  if (p === '/api/records' && req.method === 'GET') {
    const rows = db.prepare('SELECT * FROM records WHERE hidden = 0 ORDER BY created DESC LIMIT 200').all() as unknown as Row[]
    const s = studies(d)
    json(res, 200, { records: rows.map((r) => summary(d, r, s[r.id])) })
    return true
  }
  if (p === '/api/records' && req.method === 'POST') {
    if (!me) return json(res, 401, { error: '로그인하면 기보를 올릴 수 있어요 (게스트도 돼요)' }), true
    const body = await d.readBody(req, 20_000)
    const setup = (v: unknown) => ((SETUPS as readonly string[]).includes(String(v)) ? (String(v) as Setup) : null)
    const cho = setup(body.choSetup)
    const han = setup(body.hanSetup)
    if (!cho || !han) return json(res, 400, { error: '차림을 알 수 없어요' }), true
    const moves = (Array.isArray(body.moves) ? body.moves : []).map(String)
    if (moves.length < MIN_PLIES) return json(res, 400, { error: `기보를 ${MIN_PLIES}수 이상 두어 주세요` }), true
    if (moves.length > MAX_PLIES) return json(res, 400, { error: '기보가 너무 길어요' }), true
    const start = startFen(cho, han)
    const legal = withBoard(start, (b) => moves.every((m) => b.legalMoves().split(' ').includes(m) && (b.push(m), true)))
    if (!legal) return json(res, 400, { error: '규칙에 맞지 않는 수가 있어요' }), true
    const f = info(body)
    if (!f.cho_name || !f.han_name) return json(res, 400, { error: '초와 한의 대국자를 적어 주세요' }), true
    if (!f.event) return json(res, 400, { error: '대회 이름을 적어 주세요' }), true
    const line = moves.join(' ')
    const dup = db.prepare('SELECT id FROM records WHERE cho_setup = ? AND han_setup = ? AND moves = ?').get(cho, han, line) as { id: string } | undefined
    if (dup) return json(res, 409, { error: '이미 올라온 기보예요', id: dup.id }), true
    const today = (db.prepare('SELECT COUNT(*) n FROM records WHERE submitter_id = ? AND created > ?').get(me.id, Date.now() - 86_400_000) as { n: number }).n
    if (today >= PER_DAY) return json(res, 429, { error: `기보는 하루에 ${PER_DAY}개까지 올릴 수 있어요` }), true
    const id = 'r-' + Array.from(crypto.randomBytes(8), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('')
    db.prepare(
      `INSERT INTO records (id, submitter_id, cho_setup, han_setup, moves, cho_name, han_name, event, round, date, result, reason, source, note, created)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, me.id, cho, han, line, f.cho_name, f.han_name, f.event, f.round, f.date, f.result, f.reason, f.source, f.note, Date.now())
    gameAnalysis(start, moves) // the review is ready in a few minutes
    rebuildRecords()
    json(res, 200, { id })
    return true
  }

  const m = /^\/api\/records\/(r-[a-z0-9]{8})(?:\/(analysis|save|delete))?$/.exec(p)
  if (!m) return false
  const r = db.prepare('SELECT * FROM records WHERE id = ?').get(m[1]) as Row | undefined
  if (!r || (r.hidden && !isAdmin(d, me))) return json(res, 404, { error: '기보를 찾을 수 없어요' }), true
  const moves = r.moves.split(' ').filter(Boolean)
  const start = startFen(r.cho_setup, r.han_setup)

  if (!m[2] && req.method === 'GET') {
    const owner = me?.id === r.submitter_id
    json(res, 200, { record: { ...summary(d, r, studies(d)[r.id]), note: r.note, startFen: start, uci: moves, owner, admin: isAdmin(d, me) } })
    return true
  }
  if (m[2] === 'analysis' && req.method === 'GET') return json(res, 200, gameAnalysis(start, moves)), true
  if (req.method !== 'POST') return false
  if (!me) return json(res, 401, { error: '로그인이 필요해요' }), true
  const owner = me.id === r.submitter_id
  if (m[2] === 'save') {
    if (!owner && !isAdmin(d, me)) return json(res, 403, { error: '올린 사람만 고칠 수 있어요' }), true
    const f = info(await d.readBody(req, 20_000))
    if (!f.cho_name || !f.han_name || !f.event) return json(res, 400, { error: '대국자와 대회 이름은 비울 수 없어요' }), true
    db.prepare('UPDATE records SET cho_name = ?, han_name = ?, event = ?, round = ?, date = ?, result = ?, reason = ?, source = ?, note = ? WHERE id = ?').run(
      f.cho_name,
      f.han_name,
      f.event,
      f.round,
      f.date,
      f.result,
      f.reason,
      f.source,
      f.note,
      r.id,
    )
    rebuildRecords() // the result may have changed
    return json(res, 200, { ok: true }), true
  }
  if (m[2] === 'delete') {
    if (!isAdmin(d, me) && !(owner && !studies(d)[r.id])) return json(res, 403, { error: '지울 수 없어요 (연구가 나온 기보는 운영자만 지울 수 있어요)' }), true
    db.prepare('DELETE FROM records WHERE id = ?').run(r.id)
    rebuildRecords()
    return json(res, 200, { ok: true }), true
  }
  return false
}
