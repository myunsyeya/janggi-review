// Tournament records on the analysis board: the form that uploads the main line as a record (or fixes a record's
// details), and the bar that shows a loaded record's event, links and the researcher's study.
import { useState } from 'react'
import type { GameResult } from './janggi'
import { savedToken } from './net'
import { deleteRecord, emptyInfo, infoOf, recordTitle, saveRecordInfo, uploadRecord, type RecordDetail, type RecordInfo } from './recordData'

export default function RecordForm({
  start,
  moves,
  edit,
  onDone,
}: {
  start: string
  moves: string[]
  /** fixing an uploaded record's details instead of uploading */
  edit?: RecordDetail
  onDone: (id: string, info: RecordInfo) => void
}) {
  const [info, setInfo] = useState<RecordInfo>(() => (edit ? infoOf(edit) : emptyInfo()))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof RecordInfo) => (e: { target: { value: string } }) => setInfo((i) => ({ ...i, [k]: e.target.value }))

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      if (edit) {
        await saveRecordInfo(edit.id, info)
        onDone(edit.id, info)
      } else {
        const r = await uploadRecord(start, moves, info)
        onDone(r.id, info)
      }
    } catch (e) {
      const dup = (e as { data?: { id?: string } }).data?.id
      if (dup && confirm('이미 올라온 기보예요. 그 기보를 열까요?')) return onDone(dup, info)
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!savedToken()) return <div className="record-form muted small">대국 화면에서 로그인하면(게스트도 돼요) 기보를 올릴 수 있어요.</div>

  return (
    <div className="record-form">
      {!edit && (
        <div className="muted small">
          판의 본 수순({moves.length}수)을 대회 기보로 올려요. 올리면 바로 게임 리뷰가 열리고, 매시 도는 연구자가 이 대국의 연구를 따로 써요.
        </div>
      )}
      <div className="record-grid">
        <label>
          초 대국자
          <input value={info.choName} maxLength={30} onChange={set('choName')} />
        </label>
        <label>
          한 대국자
          <input value={info.hanName} maxLength={30} onChange={set('hanName')} />
        </label>
        <label className="wide">
          대회
          <input value={info.event} maxLength={60} placeholder="예: 2026 전국장기대회" onChange={set('event')} />
        </label>
        <label>
          라운드
          <input value={info.round} maxLength={30} placeholder="예: 결승" onChange={set('round')} />
        </label>
        <label>
          날짜
          <input type="date" value={info.date} onChange={set('date')} />
        </label>
        <label>
          결과
          <select value={info.result} onChange={(e) => setInfo((i) => ({ ...i, result: e.target.value as '' | GameResult }))}>
            <option value="">모름</option>
            <option value="1-0">초 승</option>
            <option value="0-1">한 승</option>
            <option value="1/2-1/2">무승부</option>
          </select>
        </label>
        <label>
          어떻게
          <input value={info.reason} maxLength={30} placeholder="예: 외통, 기권, 점수" onChange={set('reason')} />
        </label>
        <label className="wide">
          영상 링크
          <input type="url" value={info.source} maxLength={300} placeholder="https://…" onChange={set('source')} />
        </label>
        <label className="wide">
          연구자에게 남길 말
          <textarea value={info.note} maxLength={500} rows={2} placeholder="선택. 예: 30수 근처가 궁금해요" onChange={set('note')} />
        </label>
      </div>
      <div className="record-actions">
        <button className="btn primary" disabled={busy || !info.choName.trim() || !info.hanName.trim() || !info.event.trim()} onClick={submit}>
          {edit ? '고치기' : '대회 기보로 올리기'}
        </button>
        {error && <span className="record-error">{error}</span>}
      </div>
    </div>
  )
}

/** The loaded record: event, result, video, and the study about it */
export function RecordBar({ record, onChange, onDeleted }: { record: RecordDetail; onChange: (r: RecordDetail) => void; onDeleted: () => void }) {
  const [editing, setEditing] = useState(false)
  const where = [recordTitle(record), record.date].filter(Boolean).join(' · ')
  const remove = async () => {
    if (!confirm('이 기보를 지울까요?')) return
    try {
      await deleteRecord(record.id)
      history.replaceState(null, '', '/analysis')
      onDeleted()
    } catch (e) {
      alert((e as Error).message)
    }
  }
  return (
    <div className="record-bar">
      <div className="record-bar-head">
        <span className="record-badge">대회 기보</span>
        <span className="record-where">{where}</span>
      </div>
      <div className="record-bar-links">
        {record.study ? <a href={`/study/${record.study}`}>연구 보기</a> : <span className="muted">연구 준비 중</span>}
        {record.source && (
          <a href={record.source} target="_blank" rel="noopener noreferrer nofollow">
            대국 영상
          </a>
        )}
        <span className="muted">올린 사람 {record.submitter}</span>
        {(record.owner || record.admin) && <button onClick={() => setEditing((e) => !e)}>{editing ? '닫기' : '정보 고치기'}</button>}
        {((record.owner && !record.study) || record.admin) && <button onClick={remove}>지우기</button>}
      </div>
      {editing && (
        <RecordForm
          start={record.startFen}
          moves={record.uci}
          edit={record}
          onDone={(_, i) => {
            setEditing(false)
            onChange({ ...record, cho: i.choName, han: i.hanName, event: i.event, round: i.round, date: i.date, result: i.result || null, reason: i.reason, source: i.source, note: i.note })
          }}
        />
      )}
    </div>
  )
}
