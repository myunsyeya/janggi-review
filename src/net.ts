// Talking to the game server: REST for accounts/history, one WebSocket for queue and live games.

export interface PublicUser {
  id: number
  nick: string
  tag: string
  rating: number
  provisional: boolean
  games: number
  avatar: string | null
}

export type PlayerRecord = PublicUser & { wins: number; draws: number; losses: number }

export type Side = 'cho' | 'han'

export interface GameView {
  id: string
  phase: 'setup-han' | 'setup-cho' | 'play' | 'over'
  cho: PublicUser
  han: PublicUser
  setups: Partial<Record<Side, string>>
  startFen: string | null
  moves: string[]
  clock: Record<Side, number>
  turn: Side | null
  deadline: number | null
  drawOffer: Side | null
  result: '1-0' | '0-1' | '1/2-1/2' | null
  reason: string | null
  delta: Record<Side, number> | null
  increment: number
}

export interface GamePlayer {
  id: number
  nick: string
  tag: string
  avatar: string | null
  rating: number
  delta: number
}

export interface GameSummary {
  id: string
  cho: GamePlayer
  han: GamePlayer
  result: string
  reason: string
  moves: number
  ended: number
}

const TOKEN_KEY = 'janggi.token'

export function savedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function saveToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // private mode etc.: stays logged in for this page only
  }
}

export async function api<T>(path: string, token?: string | null, body?: unknown): Promise<T> {
  const res = await fetch('/api' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error ?? `HTTP ${res.status}`), { data })
  return data as T
}

export type ServerMsg =
  | { t: 'me'; user: PublicUser }
  | { t: 'queue'; waiting: boolean; count: number }
  | { t: 'game'; game: GameView }
  | { t: 'pong' }

/** WebSocket that reconnects on its own. */
export class Conn {
  private ws: WebSocket | null = null
  private closed = false
  private retry = 0
  private pinger = 0
  connected = false
  private token: string
  private onMsg: (m: ServerMsg) => void
  private onStatus: (connected: boolean) => void

  constructor(token: string, onMsg: (m: ServerMsg) => void, onStatus: (connected: boolean) => void) {
    this.token = token
    this.onMsg = onMsg
    this.onStatus = onStatus
    this.open()
  }

  private open() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(this.token)}`)
    this.ws = ws
    ws.onopen = () => {
      this.retry = 0
      this.connected = true
      this.onStatus(true)
      this.pinger = window.setInterval(() => this.send({ t: 'ping' }), 25000)
    }
    ws.onmessage = (e) => this.onMsg(JSON.parse(e.data))
    ws.onclose = () => {
      clearInterval(this.pinger)
      this.connected = false
      this.onStatus(false)
      if (this.closed) return
      const wait = Math.min(10000, 500 * 2 ** this.retry++)
      setTimeout(() => !this.closed && this.open(), wait)
    }
  }

  send(msg: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  close() {
    this.closed = true
    this.ws?.close()
  }
}
