import { useEffect, useState } from 'react'
import { api } from './net'
import { lineSan } from './janggi'

interface Row {
  uci: string
  n: number
  cho: number
  draw: number
  han: number
}
interface RecordGame {
  id: string
  cho: string
  han: string
  event: string
  round: string
  date: string
  result: string | null
  reason: string
  next: string // the move played from this position
  ply: number
}
type Source = 'records' | 'site'
interface Data {
  key: string
  moves: Row[]
  total: number
  games?: RecordGame[]
}

const SOURCE_KEY = 'janggi.explorer'
const savedSource = (): Source => {
  try {
    return localStorage.getItem(SOURCE_KEY) === 'records' ? 'records' : 'site'
  } catch {
    return 'site'
  }
}
const RESULT: Record<string, string> = { '1-0': '1-0', '0-1': '0-1', '1/2-1/2': '½' }

/**
 * Moves played from this position, with how those games ended: in this site's finished games, or in tournament
 * records (대회 기보, like lichess's Masters database), which also lists the records that reached the position.
 */
export default function Explorer({ fen, onPlay, onOpenRecord }: { fen: string; onPlay: (uci: string) => void; onOpenRecord: (id: string) => void }) {
  const [source, setSourceState] = useState<Source>(savedSource)
  const [data, setData] = useState<Data | null>(null)
  const key = source + ' ' + fen
  const setSource = (s: Source) => {
    setSourceState(s)
    try {
      localStorage.setItem(SOURCE_KEY, s)
    } catch {
      /* the choice is just not remembered */
    }
  }
  useEffect(() => {
    let live = true
    api<Omit<Data, 'key'>>(`/explorer?source=${source}&fen=${encodeURIComponent(fen)}`).then(
      (r) => live && setData({ key, ...r }),
      () => live && setData({ key, moves: [], total: 0 }),
    )
    return () => {
      live = false
    }
  }, [fen, source, key])

  const tabs = (
    <div className="explorer-tabs">
      <button className={source === 'records' ? 'on' : ''} onClick={() => setSource('records')}>
        대회 기보
      </button>
      <button className={source === 'site' ? 'on' : ''} onClick={() => setSource('site')}>
        사이트 대국
      </button>
    </div>
  )
  if (!data || data.key !== key)
    return (
      <section className="explorer">
        {tabs}
        <div className="muted pad">불러오는 중…</div>
      </section>
    )
  if (!data.total)
    return (
      <section className="explorer">
        {tabs}
        <div className="muted pad">
          {source === 'records' ? (
            <>
              올라온 대회 기보에서 아직 이 국면이 나온 적이 없어요. 대회 기보는 <a href="/records">누구나 올릴 수 있어요</a>.
            </>
          ) : (
            <>이 사이트 대국에서 아직 이 국면이 나온 적이 없어요. 대국이 쌓이면 사람들이 둔 수가 여기에 모여요.</>
          )}{' '}
          지금은 <b>분석</b> 탭의 엔진 수순을 참고하세요.
        </div>
      </section>
    )
  const pct = (x: number, n: number) => Math.round((100 * x) / n)
  return (
    <section className="explorer">
      {tabs}
      <div className="explorer-head">
        <span>수</span>
        <span>대국</span>
        <span>초 승 · 무 · 한 승</span>
      </div>
      {data.moves.map((m) => (
        <button className="explorer-row" key={m.uci} onClick={() => onPlay(m.uci)}>
          <span className="explorer-move">{lineSan(fen, [m.uci])[0] ?? m.uci}</span>
          <span className="explorer-n">
            {m.n} <span className="muted">({pct(m.n, data.total)}%)</span>
          </span>
          <span className="explorer-bar" title={`초 ${m.cho} · 무 ${m.draw} · 한 ${m.han}${m.n - m.cho - m.draw - m.han ? ` · 결과 모름 ${m.n - m.cho - m.draw - m.han}` : ''}`}>
            <span className="b-cho" style={{ width: `${pct(m.cho, m.n)}%` }}>
              {pct(m.cho, m.n) >= 15 ? `${pct(m.cho, m.n)}%` : ''}
            </span>
            <span className="b-draw" style={{ width: `${pct(m.draw, m.n)}%` }} />
            <span className="b-han" style={{ width: `${pct(m.han, m.n)}%` }}>
              {pct(m.han, m.n) >= 15 ? `${pct(m.han, m.n)}%` : ''}
            </span>
          </span>
        </button>
      ))}
      <div className="muted small pad">{source === 'records' ? `대회 기보 ${data.total}판 기준` : `이 사이트에서 끝난 대국 ${data.total}판 기준`}</div>
      {!!data.games?.length && (
        <div className="explorer-games">
          <div className="explorer-games-head">이 국면이 나온 대회 기보</div>
          {data.games.map((g) => (
            <button key={g.id} className="explorer-game" onClick={() => onOpenRecord(g.id)} title="이 기보의 게임 리뷰 열기">
              <span className="eg-result">{g.result ? RESULT[g.result] : '?'}</span>
              <span className="eg-players">
                {g.cho} <span className="muted">vs</span> {g.han}
              </span>
              <span className="eg-move">{lineSan(fen, [g.next])[0]}</span>
              <span className="eg-event muted">
                {[g.event, g.round].filter(Boolean).join(' ')}
                {g.date && ` · ${g.date.slice(0, 4)}`}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
