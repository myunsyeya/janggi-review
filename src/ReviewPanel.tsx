import { useMemo, useState, type ReactNode } from 'react'
import { ClassIcon } from './icons'
import { choScore, lineSan } from './janggi'
import { CLASS_INFO, SUMMARY_ORDER, choWin, summarize, type MoveReview, type PosEval } from './review'
import { Coach, LineMoves, evalSide } from './ui'
import { formatScore } from './janggi'

type Ply = { uci: string; san: string; fen: string }


function scoreAfter(fen: string, e: PosEval | undefined) {
  if (!e) return undefined
  if (e.terminal !== undefined) return { mate: choWin(fen, e) > 0.5 ? 1 : -1 }
  return e.lines[0] && choScore(fen, e.lines[0])
}

export default function ReviewPanel(p: {
  canStart: boolean
  reviewed: boolean
  run: { done: number; total: number } | null
  onStart: () => void
  cur: number
  plies: Ply[]
  start: string
  prevFen: string
  review: MoveReview | null
  move: { san: string; fen: string } | null // the move shown on the board (main line or variation)
  evaluating: boolean
  onPickBest: (ucis: string[]) => void
  onHoverBest?: (i: number | null, el?: HTMLElement) => void
  reviews: (MoveReview | null)[]
  /** evaluations of the start and of the position after each main-line move */
  posEvals: (PosEval | undefined)[]
  /** evaluation of the position after the move shown */
  moveEval?: PosEval
  onSelect: (i: number) => void
}) {
  const [showLine, setShowLine] = useState(false)
  const summary = useMemo(() => summarize(p.start, p.plies, p.reviews), [p.start, p.plies, p.reviews])

  if (!p.reviewed) {
    const msg = p.run
      ? `수를 분석하고 있어요… ${p.run.done} / ${p.run.total}`
      : p.plies.length === 0
        ? '수를 두고 나면 게임 리뷰를 시작할 수 있어요.'
        : '엔진이 모든 수를 다시 분석해서 수마다 평가를 매겨요.'
    return (
      <section className="review">
        <Coach>{msg}</Coach>
        {p.run ? (
          <div className="progress">
            <div style={{ width: `${(100 * p.run.done) / Math.max(1, p.run.total)}%` }} />
          </div>
        ) : (
          <button className="btn primary big" disabled={!p.canStart} onClick={p.onStart}>
            게임 리뷰 시작
          </button>
        )}
      </section>
    )
  }

  const r = p.review
  let coach: ReactNode = '게임 리뷰를 마쳤어요. 수를 하나씩 넘기며 확인해 보세요.'
  if (p.move && !r) coach = p.evaluating ? `${p.move.san} 을(를) 평가하는 중…` : p.move.san
  if (r && p.move) {
    const ply = p.move
    const info = CLASS_INFO[r.cls]
    const score = scoreAfter(ply.fen, p.moveEval)
    const bestSan = !r.isBest && r.best ? lineSan(p.prevFen, [r.best])[0] : null
    coach = (
      <>
        <div className="coach-title">
          <ClassIcon cls={r.cls} size={22} />
          <span style={{ color: info.color }}>
            <b>{ply.san}</b> 은(는) {info.label}입니다
          </span>
          {score && <span className={`chip ${evalSide(score)}`}>{formatScore(score)}</span>}
        </div>
        {bestSan && (
          <div className="coach-best">
            최선의 수는 <b>{bestSan}</b>입니다
            <button className="link" onClick={() => setShowLine((s) => !s)}>
              {showLine ? '수순 숨기기' : '최선의 수순 보기'}
            </button>
          </div>
        )}
        {bestSan && showLine && (
          <div className="coach-line">
            <LineMoves fen={p.prevFen} sans={lineSan(p.prevFen, r.bestLine, 10)} onPick={(i) => p.onPickBest(r.bestLine.slice(0, i + 1))} onHover={p.onHoverBest} />
          </div>
        )}
      </>
    )
  }

  const acc = (v: number | null) => (v === null ? '–' : v.toFixed(1))
  return (
    <section className="review">
      <Coach>{coach}</Coach>
      <EvalGraph start={p.start} plies={p.plies} posEvals={p.posEvals} reviews={p.reviews} cur={p.cur} onSelect={p.onSelect} />
      {!p.move && (
      <>
      <div className="accuracy">
        <div className="acc-box cho">
          <span className="acc-name">초</span>
          <span className="acc-val">{acc(summary.accuracy.cho)}</span>
        </div>
        <span className="acc-label">정확도</span>
        <div className="acc-box han">
          <span className="acc-name">한</span>
          <span className="acc-val">{acc(summary.accuracy.han)}</span>
        </div>
      </div>
      <div className="summary">
        {SUMMARY_ORDER.map((c) => (
          <div className="summary-row" key={c}>
            <span className="sum-label">{CLASS_INFO[c].label}</span>
            <span className="sum-n" style={{ color: CLASS_INFO[c].color }}>
              {summary.counts.cho[c]}
            </span>
            <ClassIcon cls={c} size={20} />
            <span className="sum-n" style={{ color: CLASS_INFO[c].color }}>
              {summary.counts.han[c]}
            </span>
          </div>
        ))}
      </div>
      {p.plies.length > 0 && (
        <button className="btn primary big" onClick={() => p.onSelect(1)}>
          수를 따라가며 리뷰
        </button>
      )}
      </>
      )}
    </section>
  )
}

const GRAPH_MARKS = new Set(['brilliant', 'great', 'miss', 'mistake', 'blunder'])

function EvalGraph(p: {
  start: string
  plies: Ply[]
  posEvals: (PosEval | undefined)[]
  reviews: (MoveReview | null)[]
  cur: number
  onSelect: (i: number) => void
}) {
  const fens = [p.start, ...p.plies.map((x) => x.fen)]
  const ws = fens.map((f, i) => (p.posEvals[i] ? choWin(f, p.posEvals[i]!) : 0.5))
  const n = Math.max(1, ws.length - 1)
  const pts = ws.map((w, i) => `${((i / n) * 100).toFixed(3)},${(100 - w * 100).toFixed(3)}`)
  const area = `M0,100 L${pts.join(' L')} L100,100 Z`
  return (
    <div
      className="graph"
      onClick={(e) => {
        const box = e.currentTarget.getBoundingClientRect()
        p.onSelect(Math.round(((e.clientX - box.left) / box.width) * n))
      }}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect width={100} height={100} fill="var(--eval-han)" />
        <path d={area} fill="var(--eval-cho)" />
        <line x1={0} x2={100} y1={50} y2={50} stroke="#8a8784" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="graph-cur" style={{ left: `${(p.cur / n) * 100}%` }} />
      {p.reviews.map((r, i) =>
        r && GRAPH_MARKS.has(r.cls) ? (
          <span
            key={i}
            className="graph-dot"
            style={{
              left: `${((i + 1) / n) * 100}%`,
              top: `${100 - ws[i + 1] * 100}%`,
              background: CLASS_INFO[r.cls].color,
            }}
          />
        ) : null,
      )}
    </div>
  )
}

