// Studies written by users on the site (the official ones are files in content/studies/, built into dist/).
// Chapters are stored as the same PGN-style text as the official ones and checked with the same parser.
// Ids start with "u-" so they never collide with official study folders.
//
// Likes decide what else a user study feeds:
//   SEO_LIKES   and more: its pages are indexable and listed in /sitemap-user-studies.xml
//   NAME_LIKES  and more: its [%name] positions and its moves count for opening names and theory, unless an
//                         official study already named that position
// Reports: REPORT_HIDE reports take a study off the lists; admins (server/data/admins.txt, one nick#tag per line)
// can hide, unhide or delete any study.
// Analysis requests: a chapter holding a recorded game ([ChoPlayer]/[HanPlayer] headers, see studyFormat.ts) can be
// handed to the hourly researcher by its owner if they are listed in server/data/requesters.txt (or are an admin).
// The researcher reads study_requests (scripts/requests.ts) and answers with an official study whose study.json
// has "request": "<study id>/<chapter id>".
import crypto from 'node:crypto'
import fs from 'node:fs'
import type http from 'node:http'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { startFen, withBoard } from '../src/janggi.ts'
import { parseChapter, type StudyChapter, type StudyNode } from '../src/studyFormat.ts'

export const SEO_LIKES = 3
export const NAME_LIKES = 5
const REPORT_HIDE = 3
const MAX_STUDIES_PER_USER = 30
const MAX_CHAPTERS = 30
const MAX_PGN = 60_000

export interface UserStudyDeps {
  db: DatabaseSync
  user: (auth: string | undefined) => { id: number; nick: string; tag: string } | undefined
  json: (res: http.ServerResponse, status: number, body: unknown) => void
  readBody: (req: http.IncomingMessage, limit?: number) => Promise<Record<string, unknown>>
  dist: string // built site, for the official topics and names
  dataDir: string
}

interface Row {
  id: string
  owner_id: number
  title: string
  description: string
  topics: string
  chapters: string
  published: number
  hidden: number
  created: number
  updated: number
}
interface StoredChapter {
  id: string
  pgn: string
}

export function initUserStudies(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_studies (
      id TEXT PRIMARY KEY,
      owner_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      topics TEXT NOT NULL DEFAULT '[]',
      chapters TEXT NOT NULL DEFAULT '[]',
      published INTEGER NOT NULL DEFAULT 0,
      hidden INTEGER NOT NULL DEFAULT 0,
      created INTEGER NOT NULL,
      updated INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS user_studies_owner ON user_studies(owner_id);
    CREATE TABLE IF NOT EXISTS study_reports (
      study_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created INTEGER NOT NULL,
      PRIMARY KEY (study_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS study_requests (
      study_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      requester_id INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created INTEGER NOT NULL,
      PRIMARY KEY (study_id, chapter_id)
    );
  `)
}

const randomId = (prefix: string, n: number) => {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return prefix + Array.from(crypto.randomBytes(n), (b) => abc[b % abc.length]).join('')
}

export const likesOf = (db: DatabaseSync, id: string) =>
  (db.prepare('SELECT COUNT(*) n FROM study_likes WHERE study_id = ?').get(id) as { n: number }).n
const reportsOf = (db: DatabaseSync, id: string) =>
  (db.prepare('SELECT COUNT(*) n FROM study_reports WHERE study_id = ?').get(id) as { n: number }).n

function listed(d: UserStudyDeps, file: string, u: { nick: string; tag: string } | undefined) {
  if (!u) return false
  try {
    const list = fs.readFileSync(path.join(d.dataDir, file), 'utf8').split('\n').map((l) => l.trim())
    return list.includes(`${u.nick}#${u.tag}`)
  } catch {
    return false
  }
}
const isAdmin = (d: UserStudyDeps, u: { nick: string; tag: string } | undefined) => listed(d, 'admins.txt', u)
const canRequest = (d: UserStudyDeps, u: { nick: string; tag: string } | undefined) => listed(d, 'requesters.txt', u) || isAdmin(d, u)

/** Official studies (built) by the request they answer: "<study>/<chapter>" -> official study id */
function answered(d: UserStudyDeps): Record<string, string> {
  try {
    const index = JSON.parse(fs.readFileSync(path.join(d.dist, 'studies/index.json'), 'utf8')) as { id: string; request?: string }[]
    return Object.fromEntries(index.filter((s) => s.request).map((s) => [s.request!, s.id]))
  } catch {
    return {}
  }
}

/** The owner's view of a study's requests, by chapter */
function requestsOf(d: UserStudyDeps, studyId: string) {
  const done = answered(d)
  const rows = d.db.prepare('SELECT chapter_id, note, created FROM study_requests WHERE study_id = ?').all(studyId) as {
    chapter_id: string
    note: string
    created: number
  }[]
  return Object.fromEntries(rows.map((r) => [r.chapter_id, { note: r.note, created: day(r.created), answer: done[`${studyId}/${r.chapter_id}`] }]))
}

function officialTopics(d: UserStudyDeps): string[] {
  try {
    return Object.keys(JSON.parse(fs.readFileSync(path.join(d.dist, 'studies/topics.json'), 'utf8')))
  } catch {
    return []
  }
}

function parseAll(stored: StoredChapter[]): StudyChapter[] {
  return stored.map((c) => parseChapter(c.pgn, c.id))
}

function author(d: UserStudyDeps, ownerId: number) {
  const u = d.db.prepare('SELECT nick, tag FROM users WHERE id = ?').get(ownerId) as { nick: string; tag: string } | undefined
  return u ? `${u.nick}#${u.tag}` : '(탈퇴한 사용자)'
}

const day = (t: number) => new Date(t).toISOString().slice(0, 10)

function meta(d: UserStudyDeps, r: Row) {
  const chapters = parseAll(JSON.parse(r.chapters))
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    topics: JSON.parse(r.topics) as string[],
    author: author(d, r.owner_id),
    user: true,
    created: day(r.created),
    updated: day(r.updated),
    chapters: chapters.map((c) => ({ id: c.id, name: c.name, topics: c.topics })),
  }
}

/** Published, not hidden, not taken down by reports */
export function listedStudies(d: UserStudyDeps): Row[] {
  return (d.db.prepare('SELECT * FROM user_studies WHERE published = 1 AND hidden = 0 ORDER BY updated DESC').all() as unknown as Row[]).filter(
    (r) => reportsOf(d.db, r.id) < REPORT_HIDE,
  )
}

export function getStudy(d: UserStudyDeps, id: string) {
  return d.db.prepare('SELECT * FROM user_studies WHERE id = ?').get(id) as Row | undefined
}

/** A user study as the viewer gets it (official study JSON shape), or undefined if the viewer may not see it */
export function viewStudy(d: UserStudyDeps, r: Row, viewer?: { id: number; nick: string; tag: string }) {
  const owner = viewer?.id === r.owner_id
  const admin = isAdmin(d, viewer)
  const visible = (r.published && !r.hidden && reportsOf(d.db, r.id) < REPORT_HIDE) || owner || admin
  if (!visible) return undefined
  const stored = JSON.parse(r.chapters) as StoredChapter[]
  return {
    ...meta(d, r),
    chapters: parseAll(stored),
    published: !!r.published,
    hidden: !!r.hidden,
    reports: owner || admin ? reportsOf(d.db, r.id) : undefined,
    likes: likesOf(d.db, r.id),
    owner,
    admin,
    pgn: owner ? stored : undefined,
    canRequest: owner && canRequest(d, viewer),
    requests: owner ? requestsOf(d, r.id) : undefined,
  }
}

// --- names and theory from well-liked user studies (cached; cleared on any change) ---------------------------
const positionKey = (fen: string) => fen.split(' ').slice(0, 2).join(' ')
let extraCache: { names: Record<string, unknown>; theory: string[] } | null = null
export const clearExtra = () => (extraCache = null)

function studyExtra(d: UserStudyDeps) {
  if (extraCache) return extraCache
  let official: Record<string, unknown> = {}
  try {
    official = JSON.parse(fs.readFileSync(path.join(d.dist, 'studies/names.json'), 'utf8'))
  } catch {
    /* no official names yet */
  }
  const names: Record<string, unknown> = {}
  const theory = new Set<string>()
  for (const r of listedStudies(d)) {
    if (likesOf(d.db, r.id) < NAME_LIKES) continue
    parseAll(JSON.parse(r.chapters)).forEach((ch, i) => {
      if (ch.game) return // a recorded game is not opening theory
      const chapterPath = i === 0 ? `/study/${r.id}` : `/study/${r.id}/${ch.id}`
      const visit = (node: StudyNode, fen: string, moves: string[]) => {
        for (const c of node.ch) {
          if (c.glyphs?.some((g) => g.includes('?'))) continue
          const after = withBoard(fen, (b) => (b.push(c.uci!), b.fen()))
          const key = positionKey(after)
          theory.add(key)
          if (c.name && !official[key] && !names[key]) names[key] = { name: c.name, study: r.id, chapter: ch.id, path: chapterPath, moves: [...moves, c.uci] }
          visit(c, after, [...moves, c.uci!])
        }
      }
      visit(ch.root, startFen(ch.cho, ch.han), [])
    })
  }
  extraCache = { names, theory: [...theory] }
  return extraCache
}

/** Handles /api/user-studies… and /api/study-extra. Returns false if the path is not ours. */
export async function handleUserStudies(d: UserStudyDeps, req: http.IncomingMessage, res: http.ServerResponse, url: URL, auth?: string) {
  const { db, json } = d
  const p = url.pathname
  if (p === '/api/study-extra' && req.method === 'GET') return json(res, 200, studyExtra(d)), true
  if (!p.startsWith('/api/user-studies')) return false
  const me = d.user(auth)

  if (p === '/api/user-studies' && req.method === 'GET') {
    json(res, 200, listedStudies(d).map((r) => meta(d, r)))
    return true
  }
  if (p === '/api/user-studies/mine' && req.method === 'GET') {
    if (!me) return json(res, 401, { error: '로그인이 필요해요' }), true
    const rows = db.prepare('SELECT * FROM user_studies WHERE owner_id = ? ORDER BY updated DESC').all(me.id) as unknown as Row[]
    json(res, 200, rows.map((r) => ({ ...meta(d, r), published: !!r.published, hidden: !!r.hidden })))
    return true
  }
  if (p === '/api/user-studies' && req.method === 'POST') {
    if (!me) return json(res, 401, { error: '로그인하면 연구를 쓸 수 있어요' }), true
    const n = (db.prepare('SELECT COUNT(*) n FROM user_studies WHERE owner_id = ?').get(me.id) as { n: number }).n
    if (n >= MAX_STUDIES_PER_USER) return json(res, 400, { error: `연구는 한 사람당 ${MAX_STUDIES_PER_USER}개까지 만들 수 있어요` }), true
    const id = randomId('u-', 8)
    const now = Date.now()
    const first: StoredChapter = { id: randomId('c', 4), pgn: '[Chapter "첫 챕터"]\n[Cho "마상상마"]\n[Han "마상상마"]\n\n*' }
    db.prepare('INSERT INTO user_studies (id, owner_id, title, chapters, created, updated) VALUES (?, ?, ?, ?, ?, ?)').run(
      id,
      me.id,
      '새 연구',
      JSON.stringify([first]),
      now,
      now,
    )
    json(res, 200, { id })
    return true
  }

  const m = /^\/api\/user-studies\/(u-[a-z0-9]{8})(?:\/(save|delete|report|hide|request))?$/.exec(p)
  if (!m) return false
  const r = getStudy(d, m[1])
  if (!r) return json(res, 404, { error: '연구를 찾을 수 없어요' }), true
  const action = m[2]

  if (!action && req.method === 'GET') {
    const v = viewStudy(d, r, me)
    if (!v) return json(res, 404, { error: '연구를 찾을 수 없어요' }), true
    json(res, 200, v)
    return true
  }
  if (req.method !== 'POST') return false
  if (!me) return json(res, 401, { error: '로그인이 필요해요' }), true
  const owner = me.id === r.owner_id
  const admin = isAdmin(d, me)

  if (action === 'save') {
    if (!owner) return json(res, 403, { error: '내 연구만 고칠 수 있어요' }), true
    const body = await d.readBody(req, MAX_CHAPTERS * MAX_PGN + 20_000)
    const title = String(body.title ?? '').trim().slice(0, 60)
    const description = String(body.description ?? '').trim().slice(0, 200)
    const allowed = new Set(officialTopics(d))
    const topics = (Array.isArray(body.topics) ? body.topics : []).map(String).filter((t) => allowed.has(t)).slice(0, 5)
    const raw = Array.isArray(body.chapters) ? body.chapters : []
    if (!title) return json(res, 400, { error: '제목을 적어 주세요' }), true
    if (!raw.length || raw.length > MAX_CHAPTERS) return json(res, 400, { error: `챕터는 1~${MAX_CHAPTERS}개여야 해요` }), true
    const chapters: StoredChapter[] = []
    for (const [i, c] of raw.entries()) {
      const pgn = String((c as { pgn?: unknown }).pgn ?? '')
      let id = String((c as { id?: unknown }).id ?? '')
      if (!/^c[a-z0-9]{4}$/.test(id) || chapters.some((x) => x.id === id)) id = randomId('c', 4)
      if (pgn.length > MAX_PGN) return json(res, 400, { error: `${i + 1}챕터가 너무 길어요` }), true
      try {
        parseChapter(pgn, id)
      } catch (e) {
        return json(res, 400, { error: `${i + 1}챕터: ${(e as Error).message}` }), true
      }
      chapters.push({ id, pgn })
    }
    db.prepare('UPDATE user_studies SET title = ?, description = ?, topics = ?, chapters = ?, published = ?, updated = ? WHERE id = ?').run(
      title,
      description,
      JSON.stringify(topics),
      JSON.stringify(chapters),
      body.published ? 1 : 0,
      Date.now(),
      r.id,
    )
    clearExtra()
    json(res, 200, { ok: true, chapters: chapters.map((c) => c.id) })
    return true
  }
  if (action === 'delete') {
    if (!owner && !admin) return json(res, 403, { error: '지울 수 없어요' }), true
    db.prepare('DELETE FROM user_studies WHERE id = ?').run(r.id)
    db.prepare('DELETE FROM study_likes WHERE study_id = ?').run(r.id)
    db.prepare('DELETE FROM study_reports WHERE study_id = ?').run(r.id)
    db.prepare('DELETE FROM study_requests WHERE study_id = ?').run(r.id)
    clearExtra()
    json(res, 200, { ok: true })
    return true
  }
  if (action === 'request') {
    if (!owner || !canRequest(d, me)) return json(res, 403, { error: '분석을 맡길 수 없는 계정이에요' }), true
    const body = await d.readBody(req)
    const chapterId = String(body.chapter ?? '')
    if (body.cancel) {
      db.prepare('DELETE FROM study_requests WHERE study_id = ? AND chapter_id = ?').run(r.id, chapterId)
      return json(res, 200, { ok: true, requests: requestsOf(d, r.id) }), true
    }
    const stored = (JSON.parse(r.chapters) as StoredChapter[]).find((c) => c.id === chapterId)
    if (!stored) return json(res, 400, { error: '먼저 저장해 주세요' }), true
    const ch = parseChapter(stored.pgn, stored.id)
    let plies = 0
    for (let n = ch.root.ch[0]; n; n = n.ch[0]) plies++
    if (!ch.game?.cho || !ch.game?.han) return json(res, 400, { error: '초와 한의 대국자를 적어 주세요' }), true
    if (plies < 10) return json(res, 400, { error: '기보를 10수 이상 적어 주세요' }), true
    const note = String(body.note ?? '').trim().slice(0, 500)
    db.prepare('INSERT OR REPLACE INTO study_requests (study_id, chapter_id, requester_id, note, created) VALUES (?, ?, ?, ?, ?)').run(
      r.id,
      chapterId,
      me.id,
      note,
      Date.now(),
    )
    json(res, 200, { ok: true, requests: requestsOf(d, r.id) })
    return true
  }
  if (action === 'report') {
    if (owner) return json(res, 400, { error: '내 연구는 신고할 수 없어요' }), true
    const body = await d.readBody(req)
    const reason = String(body.reason ?? '').trim().slice(0, 300) || '(사유 없음)'
    db.prepare('INSERT OR REPLACE INTO study_reports (study_id, user_id, reason, created) VALUES (?, ?, ?, ?)').run(r.id, me.id, reason, Date.now())
    clearExtra()
    json(res, 200, { ok: true })
    return true
  }
  if (action === 'hide') {
    if (!admin) return json(res, 403, { error: '운영자만 할 수 있어요' }), true
    const body = await d.readBody(req)
    db.prepare('UPDATE user_studies SET hidden = ? WHERE id = ?').run(body.hidden ? 1 : 0, r.id)
    if (!body.hidden) db.prepare('DELETE FROM study_reports WHERE study_id = ?').run(r.id) // a reviewed study starts over
    clearExtra()
    json(res, 200, { ok: true })
    return true
  }
  return false
}
