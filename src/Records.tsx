// /records: tournament records (대회 기보) people entered. Each opens in the game review; the researcher's study
// about it is linked once written.
import { useEffect, useMemo, useState } from 'react'
import { loadRecords, recordTitle, type RecordSummary } from './recordData'

const RESULT: Record<string, string> = { '1-0': '초 승', '0-1': '한 승', '1/2-1/2': '무승부' }

export default function Records({ active, onOpen }: { active: boolean; onOpen: (id: string) => void }) {
  const [records, setRecords] = useState<RecordSummary[] | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (active) loadRecords().then(setRecords, () => setRecords([]))
  }, [active])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!records || !q) return records
    return records.filter((r) => [r.cho, r.han, r.event, r.round].some((x) => x.toLowerCase().includes(q)))
  }, [records, query])

  return (
    <div className="records">
      <header className="records-head">
        <div>
          <h1>대회 기보</h1>
          <p className="muted">
            대회와 방송에서 둔 장기를 누구나 올리고, 게임 리뷰로 함께 봐요. 올린 기보는 매시 도는 연구자가 차례로 받아 전환점과 더 나은 수순을 연구로 써요.
          </p>
          <p className="muted small">
            올리는 법: <a href="/analysis">분석판</a>에서 차림을 고르고 기보대로 수를 둔 뒤, 아래의 "이 기보를 대회 기보로 올리기"를 눌러요.
          </p>
        </div>
        <input className="rank-search" placeholder="대국자나 대회로 찾기" value={query} maxLength={30} onChange={(e) => setQuery(e.target.value)} />
      </header>
      {!shown ? (
        <div className="muted pad">불러오는 중…</div>
      ) : !shown.length ? (
        <div className="muted pad">{records?.length ? '찾는 기보가 없어요.' : '아직 올라온 기보가 없어요.'}</div>
      ) : (
        <ul className="record-list">
          {shown.map((r) => (
            <li key={r.id}>
              <a
                href={`/analysis?record=${r.id}`}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey) return
                  e.preventDefault()
                  e.stopPropagation()
                  onOpen(r.id)
                }}
              >
                <span className="record-players">
                  <span className="side">초</span>
                  {r.cho} <span className="side">vs 한</span>
                  {r.han}
                </span>
                <span className="record-meta">
                  {recordTitle(r)}
                  {r.date && ` · ${r.date}`}
                </span>
                <span className="record-meta">
                  {r.result ? RESULT[r.result] : '결과 모름'}
                  {r.reason && ` · ${r.reason}`} · {r.plies}수
                </span>
                {r.study ? <span className="record-study">연구 있음</span> : <span className="record-study pending">연구 준비 중</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
