import type { GameImport } from './Analysis'
import { replay, type GameResult } from "./janggi"
import { api, type GameSummary, type Side } from './net'

/** Fetches a finished game and turns it into an analysis-board import with review on. */
export async function loadGameImport(id: string): Promise<GameImport> {
  const { game: g } = await api<{ game: GameSummary & { startFen: string; uci: string[] } }>(`/games/${id}`)
  return {
    key: g.id + ':' + Date.now(),
    startFen: g.startFen,
    moves: replay(g.startFen, g.uci),
    cho: `${g.cho.nick}#${g.cho.tag}`,
    han: `${g.han.nick}#${g.han.tag}`,
    review: true,
    result: g.result as GameResult,
    reason: g.reason,
  }
}

const SIDE_NAME: Record<Side, string> = { cho: '초', han: '한' }

/** One finished game from `userId`'s point of view. */
export default function GameRow({ g, userId, onOpen }: { g: GameSummary; userId: number; onOpen: (id: string) => void }) {
  const mine: Side = g.cho.id === userId ? 'cho' : 'han'
  const opp = mine === 'cho' ? g.han : g.cho
  const won = (g.result === '1-0' && mine === 'cho') || (g.result === '0-1' && mine === 'han')
  const draw = g.result === '1/2-1/2'
  const d = g[mine].delta
  return (
    <div className="hist-row" onClick={() => onOpen(g.id)} title="게임 리뷰 열기">
      <span className={`hist-res ${draw ? 'draw' : won ? 'win' : 'loss'}`}>{draw ? '무' : won ? '승' : '패'}</span>
      <span className="hist-opp">
        vs {opp.nick}
        <span className="muted">#{opp.tag}</span> ({opp.rating})
      </span>
      <span className="muted small">
        {SIDE_NAME[mine]} · {g.reason} · {g.moves}수 · {new Date(g.ended).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
      </span>
      <span className={`hist-delta ${d >= 0 ? 'up' : 'down'}`}>
        {d >= 0 ? '+' : ''}
        {Math.round(d)}
      </span>
    </div>
  )
}
