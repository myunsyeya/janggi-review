// Matchmaking + live games + ratings for the janggi site.
// HTTP API under /api, WebSocket at /ws. Caddy proxies both to 127.0.0.1:PORT.
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { WebSocket, WebSocketServer } from 'ws'
import { MAX_PLIES, SETUPS, type Setup, choToMove, legalNoRepeat, loadRules, countPosition, passedTwice, pointsResult, positionsSeen, sanOf, startFen, withBoard } from '../src/janggi.ts'
import { INITIAL, update, type Rating } from './glicko2.ts'
import { handleStudies, initStudies, type StudyDeps } from './studies.ts'
import { clearExtra, handleUserStudies, initUserStudies, type UserStudyDeps } from './userStudies.ts'
import { handleUserStudyPage, handleUserStudySitemap } from './userStudyPages.ts'
import { analyseLive, gameAnalysis, initAnalysis } from './analysis.ts'
import { handleRecords, initRecords } from './records.ts'
import { addSiteGame, explore, initExplorer } from './explorer.ts'

const PORT = +(process.env.JANGGI_PORT ?? 8787) // another port and data folder (JANGGI_DATA) for a test server
const INITIAL_MS = 10 * 60 * 1000
const INCREMENT_MS = 5 * 1000
const SETUP_MS = 30 * 1000
const DEFAULT_SETUP: Setup = '마상상마'

const ROOT = path.dirname(new URL(import.meta.url).pathname)
const DATA = process.env.JANGGI_DATA ?? path.join(ROOT, 'data')
fs.mkdirSync(DATA, { recursive: true, mode: 0o700 })

await loadRules({ wasmBinary: fs.readFileSync(path.join(ROOT, '../node_modules/ffish-es6/ffish.wasm')) } as never)

// --- storage -------------------------------------------------------------------

const SECRET = (() => {
  const file = path.join(DATA, 'secret')
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 })
  return fs.readFileSync(file, 'utf8').trim()
})()

const db = new DatabaseSync(path.join(DATA, 'janggi.db'))
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    nick TEXT NOT NULL,
    tag TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    rating REAL NOT NULL, rd REAL NOT NULL, vol REAL NOT NULL,
    games INTEGER NOT NULL DEFAULT 0,
    created INTEGER NOT NULL,
    UNIQUE (nick, tag)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    cho_id INTEGER NOT NULL, han_id INTEGER NOT NULL,
    start_fen TEXT NOT NULL,
    moves TEXT NOT NULL,
    result TEXT NOT NULL,
    reason TEXT NOT NULL,
    cho_rating REAL NOT NULL, han_rating REAL NOT NULL,
    cho_delta REAL NOT NULL, han_delta REAL NOT NULL,
    started INTEGER NOT NULL, ended INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS games_cho ON games(cho_id, ended);
  CREATE INDEX IF NOT EXISTS games_han ON games(han_id, ended);
`)
initStudies(db)
initUserStudies(db)
initRecords(db)
initExplorer(db)
await initAnalysis(db, path.join(ROOT, '..'))

// added later: profile pictures (version = upload time, null = none)
if (!(db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).some((c) => c.name === "avatar"))
  db.exec("ALTER TABLE users ADD COLUMN avatar INTEGER; ALTER TABLE users ADD COLUMN avatar_type TEXT")
// added later: guests ("게스트로 입장"), kept out of the ranking
if (!(db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).some((c) => c.name === "guest"))
  db.exec("ALTER TABLE users ADD COLUMN guest INTEGER NOT NULL DEFAULT 0")
const AVATARS = path.join(DATA, "avatars")
fs.mkdirSync(AVATARS, { recursive: true })
const AVATAR_MAX = 64 * 1024
const IMAGE_TYPES: [string, (b: Buffer) => boolean][] = [
  ["image/webp", (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP"],
  ["image/jpeg", (b) => b[0] === 0xff && b[1] === 0xd8],
  ["image/png", (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
]

interface User extends Rating {
  id: number
  nick: string
  tag: string
  games: number
  avatar: number | null
  avatar_type: string | null
  guest: number
}

const publicUser = (u: User) => ({
  id: u.id,
  nick: u.nick,
  tag: u.tag,
  rating: Math.round(u.rating),
  provisional: u.rd > 110,
  games: u.games,
  avatar: u.avatar ? `/api/avatar/${u.id}?v=${u.avatar}` : null,
})

const getUser = (id: number) => db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined

const NICK_RE = /^[가-힣A-Za-z0-9_]{2,12}$/

/**
 * Battle.net-style numeric tag (#1234). Keyed with the server secret, so it reveals nothing about the
 * password. Grows to 5+ digits only if every 4-digit candidate is taken for this nickname.
 */
function numericTag(nick: string, keyHash: string, taken = (t: string) => !!db.prepare("SELECT 1 FROM users WHERE nick = ? AND tag = ?").get(nick, t)) {
  for (let len = 4; ; len++) {
    for (let i = 0; i < 32; i++) {
      const h = crypto.createHmac("sha256", SECRET).update(`${keyHash}:${i}`).digest()
      const tag = String(h.readBigUInt64BE(0) % 10n ** BigInt(len)).padStart(len, "0")
      if (!taken(tag)) return tag
    }
  }
}

// one-time migration: older accounts had hex tags (e.g. #5a2a)
for (const u of db.prepare("SELECT id, nick, key_hash FROM users WHERE tag GLOB '*[^0-9]*'").all() as { id: number; nick: string; key_hash: string }[]) {
  const tag = numericTag(u.nick, u.key_hash)
  db.prepare("UPDATE users SET tag = ? WHERE id = ?").run(tag, u.id)
  console.log(`tag migrated: ${u.nick} -> #${tag}`)
}

/** Battle-tag style accounts: nickname + password pick the account; first use creates it. */
function login(nick: string, password: string): { user: User; created: boolean } {
  if (!NICK_RE.test(nick)) throw new Error('닉네임은 한글/영문/숫자/_ 2~12자로 해 주세요')
  if (typeof password !== 'string' || password.length < 4 || password.length > 128)
    throw new Error('식별번호는 4자 이상으로 해 주세요')
  const key = crypto.scryptSync(password, `janggi:${nick}`, 32)
  const keyHash = crypto.createHash('sha256').update(key).digest('hex')
  const found = db.prepare('SELECT * FROM users WHERE key_hash = ?').get(keyHash) as User | undefined
  if (found) return { user: found, created: false }
  const tag = numericTag(nick, keyHash)
  const r = db
    .prepare('INSERT INTO users (nick, tag, key_hash, rating, rd, vol, created) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(nick, tag, keyHash, INITIAL.rating, INITIAL.rd, INITIAL.vol, Date.now())
  return { user: getUser(Number(r.lastInsertRowid))!, created: true }
}

/** A guest: an account with a random key; the browser keeps its session token, so it comes back as the same guest */
function guestLogin(): User {
  const keyHash = crypto.randomBytes(32).toString('hex')
  const nick = '게스트'
  const r = db
    .prepare('INSERT INTO users (nick, tag, key_hash, rating, rd, vol, created, guest) VALUES (?, ?, ?, ?, ?, ?, ?, 1)')
    .run(nick, numericTag(nick, keyHash), keyHash, INITIAL.rating, INITIAL.rd, INITIAL.vol, Date.now())
  return getUser(Number(r.lastInsertRowid))!
}

function newSession(userId: number) {
  const token = crypto.randomBytes(32).toString('hex')
  db.prepare('INSERT INTO sessions (token, user_id, created) VALUES (?, ?, ?)').run(token, userId, Date.now())
  return token
}

function userForToken(token: string | null | undefined): User | undefined {
  if (!token) return undefined
  const s = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token) as { user_id: number } | undefined
  return s && getUser(s.user_id)
}

// --- live games --------------------------------------------------------------

type Side = 'cho' | 'han'
const other = (s: Side): Side => (s === 'cho' ? 'han' : 'cho')

interface Game {
  id: string
  players: Record<Side, User>
  phase: 'setup-han' | 'setup-cho' | 'play' | 'over'
  setups: Partial<Record<Side, Setup>>
  startFen?: string
  fen?: string
  moves: string[]
  sans: string[]
  clock: Record<Side, number>
  turnStart: number
  deadline?: number // setup phases
  timer?: NodeJS.Timeout
  drawOffer: Side | null
  result?: '1-0' | '0-1' | '1/2-1/2'
  reason?: string
  delta?: Record<Side, number>
  started: number
}

const games = new Map<string, Game>()
const activeGameOf = new Map<number, string>() // user id -> game id
const sockets = new Map<number, Set<WebSocket>>()
let queue: number[] = []

function send(userId: number, msg: unknown) {
  const data = JSON.stringify(msg)
  for (const ws of sockets.get(userId) ?? []) if (ws.readyState === WebSocket.OPEN) ws.send(data)
}

function sideOf(g: Game, userId: number): Side | null {
  if (g.players.cho.id === userId) return 'cho'
  if (g.players.han.id === userId) return 'han'
  return null
}

function turnOf(g: Game): Side {
  return choToMove(g.fen!) ? 'cho' : 'han'
}

/** Clock values as of now (the side to move keeps ticking). */
function clocksNow(g: Game) {
  const c = { ...g.clock }
  if (g.phase === 'play') c[turnOf(g)] -= Date.now() - g.turnStart
  return c
}

function view(g: Game) {
  return {
    id: g.id,
    phase: g.phase,
    cho: publicUser(g.players.cho),
    han: publicUser(g.players.han),
    setups: g.setups,
    startFen: g.startFen ?? null,
    moves: g.moves,
    clock: clocksNow(g),
    turn: g.phase === 'play' ? turnOf(g) : null,
    deadline: g.deadline ? g.deadline - Date.now() : null,
    drawOffer: g.drawOffer,
    result: g.result ?? null,
    reason: g.reason ?? null,
    delta: g.delta ?? null,
    increment: INCREMENT_MS,
  }
}

function broadcast(g: Game) {
  const v = view(g)
  send(g.players.cho.id, { t: 'game', game: v })
  send(g.players.han.id, { t: 'game', game: v })
}

function schedule(g: Game) {
  clearTimeout(g.timer)
  if (g.phase === 'setup-han' || g.phase === 'setup-cho') {
    const side: Side = g.phase === 'setup-han' ? 'han' : 'cho'
    g.timer = setTimeout(() => chooseSetup(g, side, DEFAULT_SETUP), g.deadline! - Date.now())
  } else if (g.phase === 'play') {
    const side = turnOf(g)
    g.timer = setTimeout(() => {
      if (clocksNow(g)[side] <= 0) {
        g.clock[side] = 0
        finish(g, side === 'cho' ? '0-1' : '1-0', '시간 초과')
      } else schedule(g)
    }, Math.max(0, clocksNow(g)[side]) + 50)
  }
}

function startGame(a: number, b: number) {
  const [choId, hanId] = Math.random() < 0.5 ? [a, b] : [b, a]
  const g: Game = {
    id: crypto.randomBytes(6).toString('base64url'),
    players: { cho: getUser(choId)!, han: getUser(hanId)! },
    phase: 'setup-han', // 한 sets up first, then 초, then 초 moves first
    setups: {},
    moves: [],
    sans: [],
    clock: { cho: INITIAL_MS, han: INITIAL_MS },
    turnStart: 0,
    deadline: Date.now() + SETUP_MS,
    drawOffer: null,
    started: Date.now(),
  }
  games.set(g.id, g)
  presenceChanged()
  activeGameOf.set(choId, g.id)
  activeGameOf.set(hanId, g.id)
  schedule(g)
  broadcast(g)
}

function chooseSetup(g: Game, side: Side, setup: Setup) {
  if (g.phase !== `setup-${side}` || !SETUPS.includes(setup)) return
  g.setups[side] = setup
  if (side === 'han') {
    g.phase = 'setup-cho'
    g.deadline = Date.now() + SETUP_MS
  } else {
    g.phase = 'play'
    g.deadline = undefined
    g.startFen = g.fen = startFen(g.setups.cho!, g.setups.han!)
    analyseLive(g.fen)
    g.turnStart = Date.now()
  }
  schedule(g)
  broadcast(g)
}

function playMove(g: Game, side: Side, uci: string) {
  if (g.phase !== 'play' || turnOf(g) !== side) return
  const now = Date.now()
  const left = g.clock[side] - (now - g.turnStart)
  if (left <= 0) {
    g.clock[side] = 0
    return finish(g, side === 'cho' ? '0-1' : '1-0', '시간 초과')
  }
  const seen = positionsSeen(g.startFen!, g.moves)
  if (!legalNoRepeat(g.fen!, seen).includes(uci)) return // includes the repetition rule (동일 수 3회 금지)
  const res = withBoard(g.fen!, (b) => {
    const san = sanOf(b, uci)
    b.push(uci)
    const over = b.isGameOver()
    return {
      san,
      fen: b.fen(),
      over,
      result: over ? (b.result() as Game['result']) : undefined,
      mate: over && b.numberLegalMoves() === 0 && b.isCheck(),
      bikjang: b.isBikjang(),
    }
  })
  if (!res) return
  g.clock[side] = left + INCREMENT_MS
  g.turnStart = now
  g.moves.push(uci)
  g.sans.push(res.san)
  g.fen = res.fen
  analyseLive(res.fen) // review prepared in the background; never served before the game ends
  if (g.drawOffer === other(side)) g.drawOffer = null
  if (res.over) return finish(g, res.result!, res.mate ? '외통' : res.bikjang ? '빅장' : '규칙')
  // decided on points: both sides passed in a row, or the game reached MAX_PLIES moves
  if (passedTwice(g.moves) || g.moves.length >= MAX_PLIES) {
    const p = pointsResult(res.fen)
    return finish(g, p.result, `${passedTwice(g.moves) ? '양쪽 한수쉼' : `${MAX_PLIES}수`} · 점수 ${p.score}`)
  }
  // the repetition rule can leave the side to move with nothing to play (in check, every escape would be a third
  // repetition): like being mated
  countPosition(seen, res.fen)
  if (!legalNoRepeat(res.fen, seen).length) return finish(g, side === 'cho' ? '1-0' : '0-1', '둘 수 없음 (반복 금지)')
  schedule(g)
  broadcast(g)
}

function finish(g: Game, result: NonNullable<Game['result']>, reason: string) {
  if (g.phase === 'over') return
  clearTimeout(g.timer)
  if (g.phase === 'play') g.clock[turnOf(g)] = Math.max(0, clocksNow(g)[turnOf(g)])
  g.phase = 'over'
  g.result = result
  g.reason = reason
  g.drawOffer = null

  // ratings: re-read both players so concurrent games don't overwrite each other
  const cho = getUser(g.players.cho.id)!
  const han = getUser(g.players.han.id)!
  const s = result === '1-0' ? 1 : result === '0-1' ? 0 : 0.5
  const nc = update(cho, han, s)
  const nh = update(han, cho, 1 - s)
  const save = db.prepare('UPDATE users SET rating = ?, rd = ?, vol = ?, games = games + 1 WHERE id = ?')
  save.run(nc.rating, nc.rd, nc.vol, cho.id)
  save.run(nh.rating, nh.rd, nh.vol, han.id)
  g.delta = { cho: nc.rating - cho.rating, han: nh.rating - han.rating }
  g.players = { cho: getUser(cho.id)!, han: getUser(han.id)! }

  db.prepare(
    `INSERT INTO games (id, cho_id, han_id, start_fen, moves, result, reason, cho_rating, han_rating, cho_delta, han_delta, started, ended)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    g.id,
    cho.id,
    han.id,
    g.startFen ?? startFen(g.setups.cho ?? DEFAULT_SETUP, g.setups.han ?? DEFAULT_SETUP),
    g.moves.join(' '),
    result,
    reason,
    cho.rating,
    han.rating,
    g.delta.cho,
    g.delta.han,
    g.started,
    Date.now(),
  )
  activeGameOf.delete(cho.id)
  activeGameOf.delete(han.id)
  if (g.startFen) addSiteGame(g.startFen, g.moves, result)
  if (g.startFen) gameAnalysis(g.startFen, g.moves) // the rest of the review, now at high priority
  broadcast(g)
  presenceChanged()
  setTimeout(() => games.delete(g.id), 10 * 60 * 1000)
}

// --- matchmaking ---------------------------------------------------------------

function queueState(userId: number) {
  presenceChanged()
  send(userId, { t: 'queue', waiting: queue.includes(userId), count: queue.length })
}

function joinQueue(userId: number) {
  if (activeGameOf.has(userId) || queue.includes(userId)) return queueState(userId)
  queue.push(userId)
  while (queue.length >= 2) {
    const [a, b] = queue.splice(0, 2)
    startGame(a, b)
    queueState(a)
    queueState(b)
  }
  for (const id of queue) queueState(id)
}

function leaveQueue(userId: number) {
  queue = queue.filter((id) => id !== userId)
  queueState(userId)
}

// --- HTTP ------------------------------------------------------------------------

const loginAttempts = new Map<string, number[]>()
function rateLimited(ip: string) {
  const now = Date.now()
  const recent = (loginAttempts.get(ip) ?? []).filter((t) => now - t < 60_000)
  recent.push(now)
  loginAttempts.set(ip, recent)
  return recent.length > 10
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function readBody(req: http.IncomingMessage, limit = 10_000): Promise<Record<string, unknown>> {
  let raw = ""
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > limit) throw new Error("too large")
  }
  return raw ? JSON.parse(raw) : {}
}

/** Win/draw/loss totals for a player. */
function record(id: number) {
  const r = db
    .prepare(
      `SELECT COUNT(*) total,
        SUM(CASE WHEN (cho_id = ? AND result = '1-0') OR (han_id = ? AND result = '0-1') THEN 1 ELSE 0 END) wins,
        SUM(CASE WHEN result = '1/2-1/2' THEN 1 ELSE 0 END) draws
       FROM games WHERE cho_id = ? OR han_id = ?`,
    )
    .get(id, id, id, id) as { total: number; wins: number | null; draws: number | null }
  const wins = r.wins ?? 0
  const draws = r.draws ?? 0
  return { wins, draws, losses: r.total - wins - draws }
}

function gameSummary(row: Record<string, unknown>) {
  const cho = getUser(row.cho_id as number)!
  const han = getUser(row.han_id as number)!
  const side = (u: User, rating: unknown, delta: unknown) => ({
    id: u.id,
    nick: u.nick,
    tag: u.tag,
    avatar: publicUser(u).avatar,
    rating: Math.round(rating as number),
    delta,
  })
  return {
    id: row.id,
    cho: side(cho, row.cho_rating, row.cho_delta),
    han: side(han, row.han_rating, row.han_delta),
    result: row.result,
    reason: row.reason,
    moves: (row.moves as string).split(' ').filter(Boolean).length,
    ended: row.ended,
  }
}

const studyDeps: StudyDeps = { db, userId: (auth) => userForToken(auth)?.id, json, onLike: clearExtra }
const userStudyDeps: UserStudyDeps = { db, user: (auth) => userForToken(auth), json, readBody, dist: path.join(ROOT, '../dist'), dataDir: DATA }

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://x')
    const auth = req.headers.authorization?.replace(/^Bearer /, '')
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim() ?? req.socket.remoteAddress ?? ''

    // local-only (Caddy only proxies /api and /ws): used by scripts/janggictl before restarts
    if (url.pathname === "/internal/status" && !req.headers["x-forwarded-for"]) {
      const live = [...games.values()].filter((g) => g.phase !== "over")
      return json(res, 200, {
        liveGames: live.map((g) => ({ id: g.id, phase: g.phase, moves: g.moves.length, cho: g.players.cho.nick, han: g.players.han.nick })),
        ...presenceStats(),
      })
    }
    // user studies' crawlable pages and sitemap (Caddy proxies these paths here)
    if (url.pathname.startsWith('/study/u-') && handleUserStudyPage(userStudyDeps, req, res, url)) return
    if (url.pathname === '/sitemap-user-studies.xml') return handleUserStudySitemap(userStudyDeps, res)
    if (req.method === 'POST' && url.pathname === '/api/guest') {
      if (rateLimited(ip)) return json(res, 429, { error: '잠시 후 다시 시도해 주세요' })
      const user = guestLogin()
      return json(res, 200, { token: newSession(user.id), user: publicUser(user), created: true })
    }
    if (req.method === 'POST' && url.pathname === '/api/login') {
      if (rateLimited(ip)) return json(res, 429, { error: '잠시 후 다시 시도해 주세요' })
      const body = await readBody(req)
      try {
        const { user, created } = login(String(body.nick ?? '').trim(), String(body.password ?? ''))
        return json(res, 200, { token: newSession(user.id), user: publicUser(user), created })
      } catch (e) {
        return json(res, 400, { error: (e as Error).message })
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/logout') {
      if (auth) db.prepare('DELETE FROM sessions WHERE token = ?').run(auth)
      return json(res, 200, {})
    }
    if (url.pathname === '/api/me') {
      const u = userForToken(auth)
      return u ? json(res, 200, { user: publicUser(u) }) : json(res, 401, { error: 'login required' })
    }
    if (url.pathname === '/api/games') {
      const u = userForToken(auth)
      if (!u) return json(res, 401, { error: 'login required' })
      const rows = db
        .prepare('SELECT * FROM games WHERE cho_id = ? OR han_id = ? ORDER BY ended DESC LIMIT 30')
        .all(u.id, u.id) as Record<string, unknown>[]
      return json(res, 200, { games: rows.map(gameSummary) })
    }
    // review of a finished game: engine results for its positions (only games in the database, i.e. finished)
    const ga = /^\/api\/games\/([\w-]+)\/analysis$/.exec(url.pathname)
    if (ga) {
      const row = db.prepare('SELECT start_fen, moves FROM games WHERE id = ?').get(ga[1]) as { start_fen: string; moves: string } | undefined
      if (!row) return json(res, 404, { error: '끝난 대국만 리뷰할 수 있어요' })
      return json(res, 200, gameAnalysis(row.start_fen, row.moves.split(' ').filter(Boolean)))
    }
    const m = /^\/api\/games\/([\w-]+)$/.exec(url.pathname)
    if (m) {
      const row = db.prepare('SELECT * FROM games WHERE id = ?').get(m[1]) as Record<string, unknown> | undefined
      if (!row) return json(res, 404, { error: 'not found' })
      return json(res, 200, { game: { ...gameSummary(row), startFen: row.start_fen, uci: (row.moves as string).split(' ').filter(Boolean) } })
    }
    if (req.method === "POST" && url.pathname === "/api/avatar") {
      const u = userForToken(auth)
      if (!u) return json(res, 401, { error: "login required" })
      const body = await readBody(req, 128 * 1024)
      const file = path.join(AVATARS, String(u.id))
      if (body.image === null) {
        fs.rmSync(file, { force: true })
        db.prepare("UPDATE users SET avatar = NULL, avatar_type = NULL WHERE id = ?").run(u.id)
      } else {
        const m = /^data:image\/[a-z]+;base64,(.+)$/.exec(String(body.image ?? ""))
        const buf = m ? Buffer.from(m[1], "base64") : Buffer.alloc(0)
        const type = IMAGE_TYPES.find(([, ok]) => ok(buf))?.[0]
        if (!type) return json(res, 400, { error: "이미지 파일만 올릴 수 있어요" })
        if (buf.length > AVATAR_MAX) return json(res, 400, { error: "사진이 너무 커요" })
        fs.writeFileSync(file, buf)
        db.prepare("UPDATE users SET avatar = ?, avatar_type = ? WHERE id = ?").run(Date.now(), type, u.id)
      }
      return json(res, 200, { user: publicUser(getUser(u.id)!) })
    }
    const av = /^\/api\/avatar\/(\d+)$/.exec(url.pathname)
    if (av) {
      const u = getUser(+av[1])
      const file = path.join(AVATARS, av[1])
      if (!u?.avatar || !fs.existsSync(file)) return json(res, 404, { error: "not found" })
      res.writeHead(200, {
        "Content-Type": u.avatar_type ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      })
      return res.end(fs.readFileSync(file))
    }
    if (url.pathname.startsWith('/api/study-likes') && handleStudies(studyDeps, req, res, url, auth)) return
    if (url.pathname.startsWith('/api/records') && (await handleRecords(userStudyDeps, req, res, url, auth))) return
    if ((url.pathname.startsWith('/api/user-studies') || url.pathname === '/api/study-extra') && (await handleUserStudies(userStudyDeps, req, res, url, auth))) return
    if (url.pathname === "/api/explorer") {
      return json(res, 200, explore(url.searchParams.get("fen") ?? "", url.searchParams.get("source") ?? "site"))
    }
    if (url.pathname === "/api/leaderboard") {
      const rows = db.prepare("SELECT * FROM users WHERE games > 0 AND guest = 0 ORDER BY rating DESC LIMIT 100").all() as unknown as User[]
      return json(res, 200, { users: rows.map((u) => ({ ...publicUser(u), ...record(u.id) })) })
    }
    if (url.pathname === "/api/users") {
      // search by nickname (prefix), for looking up someone's record
      const q = (url.searchParams.get("q") ?? "").trim().replace(/#.*/, "").slice(0, 12)
      if (!q) return json(res, 200, { users: [] })
      const rows = db
        .prepare("SELECT * FROM users WHERE guest = 0 AND nick LIKE ? ESCAPE '\\' ORDER BY games DESC, rating DESC LIMIT 20")
        .all(q.replace(/[\\%_]/g, (c) => "\\" + c) + "%") as unknown as User[]
      return json(res, 200, { users: rows.map((u) => ({ ...publicUser(u), ...record(u.id) })) })
    }
    const pu = /^\/api\/users\/(\d+)$/.exec(url.pathname)
    if (pu) {
      const u = getUser(+pu[1])
      if (!u) return json(res, 404, { error: "not found" })
      const rows = db
        .prepare("SELECT * FROM games WHERE cho_id = ? OR han_id = ? ORDER BY ended DESC LIMIT 50")
        .all(u.id, u.id) as Record<string, unknown>[]
      return json(res, 200, { user: { ...publicUser(u), ...record(u.id) }, games: rows.map(gameSummary) })
    }
    json(res, 404, { error: 'not found' })
  } catch (e) {
    console.error(e)
    json(res, 500, { error: 'server error' })
  }
})

// --- WebSocket -----------------------------------------------------------------------

const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 })

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://x')
  if (url.pathname === "/ws/presence") {
    // every open tab, logged in or not, for the online counter; v = random per-browser id
    const v = url.searchParams.get("v") ?? ""
    if (!/^[A-Za-z0-9]{8,32}$/.test(v)) return socket.destroy()
    return wss.handleUpgrade(req, socket, head, (ws) => onPresence(ws, v))
  }
  const user = url.pathname === '/ws' ? userForToken(url.searchParams.get('token')) : undefined
  if (!user) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }
  wss.handleUpgrade(req, socket, head, (ws) => onConnect(ws, user.id))
})

// --- presence (online counter) ---------------------------------------------------------

const presence = new Map<WebSocket, string>() // socket -> browser id
let presenceTimer: NodeJS.Timeout | undefined

function presenceStats() {
  return {
    online: new Set(presence.values()).size,
    loggedIn: sockets.size,
    playing: [...games.values()].filter((g) => g.phase !== "over").length,
    queue: queue.length,
  }
}

/** Coalesces bursts of changes into one broadcast per second. */
function presenceChanged() {
  if (presenceTimer) return
  presenceTimer = setTimeout(() => {
    presenceTimer = undefined
    const msg = JSON.stringify({ t: "presence", ...presenceStats() })
    for (const ws of presence.keys()) if (ws.readyState === WebSocket.OPEN) ws.send(msg)
  }, 1000)
}

function onPresence(ws: WebSocket, browser: string) {
  presence.set(ws, browser)
  ws.send(JSON.stringify({ t: "presence", ...presenceStats() }))
  presenceChanged()
  ws.on("message", () => {}) // keep-alive pings
  ws.on("close", () => {
    presence.delete(ws)
    presenceChanged()
  })
}

function onConnect(ws: WebSocket, userId: number) {
  if (!sockets.has(userId)) sockets.set(userId, new Set())
  sockets.get(userId)!.add(ws)
  presenceChanged()
  ws.send(JSON.stringify({ t: 'me', user: publicUser(getUser(userId)!) }))
  queueState(userId)
  const gid = activeGameOf.get(userId)
  if (gid) ws.send(JSON.stringify({ t: 'game', game: view(games.get(gid)!) }))

  ws.on('message', (data) => {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(String(data))
    } catch {
      return
    }
    const g = typeof msg.game === 'string' ? games.get(msg.game) : undefined
    const side = g ? sideOf(g, userId) : null
    switch (msg.t) {
      case 'queue':
        return joinQueue(userId)
      case 'unqueue':
        return leaveQueue(userId)
      case 'ping':
        return ws.send(JSON.stringify({ t: 'pong' }))
    }
    if (!g || !side) return
    switch (msg.t) {
      case 'setup':
        return chooseSetup(g, side, msg.setup as Setup)
      case 'move':
        return playMove(g, side, String(msg.uci))
      case 'resign':
        if (g.phase === 'play' || g.phase.startsWith('setup'))
          finish(g, side === 'cho' ? '0-1' : '1-0', '기권')
        return
      case 'draw':
        if (g.phase !== 'play') return
        if (msg.action === 'offer' && !g.drawOffer) g.drawOffer = side
        else if (msg.action === 'accept' && g.drawOffer === other(side)) return finish(g, '1/2-1/2', '합의 무승부')
        else if (msg.action === 'decline' && g.drawOffer === other(side)) g.drawOffer = null
        return broadcast(g)
    }
  })

  ws.on('close', () => {
    const set = sockets.get(userId)
    set?.delete(ws)
    if (set && set.size === 0) {
      sockets.delete(userId)
      queue = queue.filter((id) => id !== userId) // nobody to notify when matched
    }
    presenceChanged()
  })
}

server.listen(PORT, '127.0.0.1', () => console.log(`janggi server on 127.0.0.1:${PORT}`))
