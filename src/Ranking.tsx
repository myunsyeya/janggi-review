import { useEffect, useState } from 'react'
import type { GameImport } from './Analysis'
import GameRow, { loadGameImport } from './GameRow'
import { api, savedToken, type GameSummary, type PlayerRecord, type PublicUser } from './net'
import { Avatar } from './ui'

const winRate = (u: PlayerRecord) => {
  const n = u.wins + u.draws + u.losses
  return n ? Math.round(((u.wins + u.draws / 2) / n) * 100) : null
}

export default function Ranking({ active, onReview }: { active: boolean; onReview: (g: GameImport) => void }) {
  const [board, setBoard] = useState<PlayerRecord[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlayerRecord[] | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [detail, setDetail] = useState<{ user: PlayerRecord; games: GameSummary[] } | null>(null)
  const [meId, setMeId] = useState<number | null>(null)

  // refresh whenever the page is opened
  useEffect(() => {
    if (!active) return
    api<{ users: PlayerRecord[] }>('/leaderboard').then((r) => setBoard(r.users), () => {})
    const token = savedToken()
    if (token)
      api<{ user: PublicUser }>('/me', token).then(
        (r) => {
          setMeId(r.user.id)
          setSelected((s) => s ?? r.user.id)
        },
        () => {},
      )
  }, [active])

  useEffect(() => {
    const q = query.trim()
    if (!q) return setResults(null)
    const t = setTimeout(() => api<{ users: PlayerRecord[] }>(`/users?q=${encodeURIComponent(q)}`).then((r) => setResults(r.users), () => {}), 200)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (selected === null || !active) return
    api<{ user: PlayerRecord; games: GameSummary[] }>(`/users/${selected}`).then(setDetail, () => setDetail(null))
  }, [selected, active])

  const list = results ?? board
  const rankOf = (id: number) => board.findIndex((u) => u.id === id) + 1

  return (
    <div className="ranking">
      <section className="rank-card">
        <header className="rank-head">
          <h2>순위</h2>
          <input
            className="rank-search"
            placeholder="닉네임으로 전적 찾기"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={20}
          />
        </header>
        <div className="rank-table">
          <div className="rank-row rank-labels">
            <span>#</span>
            <span>플레이어</span>
            <span>레이팅</span>
            <span>승/무/패</span>
            <span>승률</span>
          </div>
          {list.length === 0 && (
            <div className="muted pad">{results ? '찾는 플레이어가 없어요.' : '아직 레이팅 대국을 둔 사람이 없어요.'}</div>
          )}
          {list.map((u) => {
            const rank = rankOf(u.id)
            const wr = winRate(u)
            return (
              <div
                key={u.id}
                className={`rank-row ${selected === u.id ? 'selected' : ''} ${meId === u.id ? 'me-row' : ''}`}
                onClick={() => setSelected(u.id)}
              >
                <span className={`rank-no ${rank && rank <= 3 ? 'top' + rank : ''}`}>{rank || '–'}</span>
                <span className="rank-player">
                  <Avatar side="cho" src={u.avatar} size={28} />
                  <span className="rank-name">
                    {u.nick}
                    <span className="muted">#{u.tag}</span>
                  </span>
                </span>
                <span className="rank-rating">
                  {u.rating}
                  {u.provisional ? <span className="muted">?</span> : null}
                </span>
                <span className="rank-wdl">
                  <span className="up">{u.wins}</span>/<span className="muted">{u.draws}</span>/<span className="down">{u.losses}</span>
                </span>
                <span className="muted">{wr === null ? '–' : wr + '%'}</span>
              </div>
            )
          })}
        </div>
      </section>

      <section className="rank-card profile-detail">
        {!detail ? (
          <div className="muted pad">순위표에서 플레이어를 누르면 전적이 나와요.</div>
        ) : (
          <>
            <div className="pd-head">
              <Avatar side="cho" src={detail.user.avatar} size={64} />
              <div>
                <div className="pd-name">
                  {detail.user.nick}
                  <span className="muted">#{detail.user.tag}</span>
                </div>
                <div className="muted small">{rankOf(detail.user.id) ? `${rankOf(detail.user.id)}위` : '순위 없음'}</div>
              </div>
            </div>
            <div className="pd-stats">
              <Stat label="레이팅" value={`${detail.user.rating}${detail.user.provisional ? '?' : ''}`} />
              <Stat label="대국" value={String(detail.user.wins + detail.user.draws + detail.user.losses)} />
              <Stat label="승" value={String(detail.user.wins)} cls="up" />
              <Stat label="무" value={String(detail.user.draws)} />
              <Stat label="패" value={String(detail.user.losses)} cls="down" />
              <Stat label="승률" value={winRate(detail.user) === null ? '–' : `${winRate(detail.user)}%`} />
            </div>
            <div className="pd-title">최근 대국</div>
            <div className="pd-games">
              {detail.games.length === 0 && <div className="muted pad">둔 대국이 없어요.</div>}
              {detail.games.map((g) => (
                <GameRow key={g.id} g={g} userId={detail.user.id} onOpen={async (id) => onReview(await loadGameImport(id))} />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="stat">
      <span className={`stat-val ${cls ?? ''}`}>{value}</span>
      <span className="muted small">{label}</span>
    </div>
  )
}
