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

/** Moves played from this position in this site's finished games, with how those games ended. */
export default function Explorer({ fen, onPlay }: { fen: string; onPlay: (uci: string) => void }) {
  const [data, setData] = useState<{ fen: string; moves: Row[]; total: number } | null>(null)
  useEffect(() => {
    let live = true
    api<{ moves: Row[]; total: number }>(`/explorer?fen=${encodeURIComponent(fen)}`).then(
      (r) => live && setData({ fen, ...r }),
      () => live && setData({ fen, moves: [], total: 0 }),
    )
    return () => {
      live = false
    }
  }, [fen])

  if (!data || data.fen !== fen) return <section className="explorer muted pad">불러오는 중…</section>
  if (!data.total)
    return (
      <section className="explorer">
        <div className="muted pad">
          이 사이트 대국에서 아직 이 국면이 나온 적이 없어요. 대국이 쌓이면 사람들이 둔 수가 여기에 모여요.
          지금은 <b>분석</b> 탭의 엔진 수순을 참고하세요.
        </div>
      </section>
    )
  const pct = (x: number, n: number) => Math.round((100 * x) / n)
  return (
    <section className="explorer">
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
          <span className="explorer-bar" title={`초 ${m.cho} · 무 ${m.draw} · 한 ${m.han}`}>
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
      <div className="muted small pad">이 사이트에서 끝난 대국 {data.total}판 기준</div>
    </section>
  )
}
