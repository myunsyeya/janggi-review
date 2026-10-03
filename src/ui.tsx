import { useEffect, useState, type ReactNode } from 'react'
import { barPercent } from './janggi'

export type Score = { cp?: number; mate?: number }

export function evalSide(s: Score) {
  const v = s.mate ?? s.cp ?? 0
  return v >= 0 ? 'cho' : 'han'
}

export function EvalBar({ score, flipped, hidden }: { score: Score; flipped: boolean; hidden: boolean }) {
  const pct = barPercent(score)
  const choAhead = (score.mate ?? score.cp ?? 0) >= 0
  const label = score.mate !== undefined ? `M${Math.abs(score.mate)}` : Math.abs((score.cp ?? 0) / 100).toFixed(1)
  return (
    <div className={`evalbar ${flipped ? 'flipped' : ''} ${hidden ? 'hidden' : ''}`}>
      <div className="evalbar-cho" style={{ height: `${pct}%` }} />
      {!hidden && <span className={`evalbar-label ${choAhead ? 'cho' : 'han'}`}>{label}</span>}
    </div>
  )
}

export function PlayerTag({
  name,
  side,
  rating,
  clock,
  active,
  avatar,
  material,
}: {
  name: string
  side: 'cho' | 'han'
  rating?: number
  clock?: number // ms
  active?: boolean
  avatar?: string | null
  material?: { score: number; captured: string[]; lead: number }
}) {
  return (
    <div className="player">
      <Avatar side={side} src={avatar} />
      <div className="player-main">
        <div className="player-line">
          <span className="player-name">{name}</span>
          {rating !== undefined && <span className="player-rating">({Math.round(rating)})</span>}
        </div>
        {material && <MaterialLine side={side} {...material} />}
      </div>
      {clock !== undefined && (
        <span className={`clock ${active ? 'active' : ''} ${clock < 30000 ? 'low' : ''}`}>{formatClock(clock)}</span>
      )}
    </div>
  )
}

export function formatClock(ms: number) {
  const t = Math.max(0, ms)
  const m = Math.floor(t / 60000)
  const s = Math.floor((t % 60000) / 1000)
  if (t < 10000) return `${m}:${String(s).padStart(2, '0')}.${Math.floor((t % 1000) / 100)}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/** "3. Hc3 Hc8 4. e5" style rendering of a SAN line starting at `fen`; `onPick(i)` jumps to move i. */
export function LineMoves({
  fen,
  sans,
  onPick,
  onHover,
}: {
  fen: string
  sans: string[]
  onPick?: (i: number) => void
  onHover?: (i: number | null, el?: HTMLElement) => void // for the mini-board preview
}) {
  const parts = fen.split(" ")
  const cho = parts[1] === "w"
  const fullmove = +parts[5] || 1
  return (
    <>
      {sans.map((s, i) => {
        const isCho = cho ? i % 2 === 0 : i % 2 === 1
        const n = fullmove + Math.floor((i + (cho ? 0 : 1)) / 2)
        const prefix = isCho ? `${n}. ` : i === 0 ? `${n}... ` : ""
        return (
          <span key={i}>
            {prefix}
            <span
              className={onPick ? "pv-move" : undefined}
              onMouseEnter={onHover && ((e) => onHover(i, e.currentTarget))}
              onMouseLeave={onHover && (() => onHover(null))}
              onClick={
                onPick &&
                ((e) => {
                  e.stopPropagation()
                  onPick(i)
                })
              }
            >
              {s}
            </span>{" "}
          </span>
        )
      })}
    </>
  )
}

export function Coach({ children }: { children: ReactNode }) {
  return (
    <div className="coach">
      <span className="coach-avatar">楚</span>
      <div className="bubble">{children}</div>
    </div>
  )
}

// --- icons ---------------------------------------------------------------------

const svgProps = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'currentColor' }
export const IconFirst = () => (
  <svg {...svgProps}>
    <path d="M6 5h2v14H6zM20 5v14l-10-7z" />
  </svg>
)
export const IconPrev = () => (
  <svg {...svgProps}>
    <path d="M16 5v14L6 12z" />
  </svg>
)
export const IconNext = () => (
  <svg {...svgProps}>
    <path d="M8 5v14l10-7z" />
  </svg>
)
export const IconLast = () => (
  <svg {...svgProps}>
    <path d="M16 5h2v14h-2zM4 5v14l10-7z" />
  </svg>
)
export const IconAnalysis = () => (
  <svg {...svgProps} width={18} height={18}>
    <path d="M3 3h2v16h16v2H3zm4 10 4-4 3 3 5-6 1.5 1.3L14.2 15 11 12l-2.6 2.6z" />
  </svg>
)
export const IconReview = () => (
  <svg {...svgProps} width={18} height={18}>
    <path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 16.9l-6.1 3.5 1.5-6.8L2.2 9l6.9-.7z" />
  </svg>
)
export const IconPlay = () => (
  <svg {...svgProps} width={18} height={18}>
    <path d="M7 4h10l-1.5 3H17v2h-2l1 9H8l1-9H7V7h1.5zM6 19h12v2H6z" />
  </svg>
)

export function Avatar({ side, src, size = 32 }: { side: 'cho' | 'han'; src?: string | null; size?: number }) {
  return src ? (
    <img className="avatar avatar-img" src={src} width={size} height={size} alt="" />
  ) : (
    <span className={`avatar ${side}`} style={{ width: size, height: size, fontSize: size * 0.5 }}>
      {side === 'cho' ? '楚' : '漢'}
    </span>
  )
}
export const IconRanking = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 13h4v8H4zM10 8h4v13h-4zM16 11h4v10h-4zM12 2l1.2 2.5 2.8.4-2 1.9.5 2.7L12 8.2 9.5 9.5l.5-2.7-2-1.9 2.8-.4z" />
  </svg>
)

const CAPTURED_HANJA: Record<string, [string, string]> = {
  r: ['車', '車'],
  c: ['包', '包'],
  n: ['馬', '馬'],
  b: ['象', '象'],
  a: ['士', '士'],
  p: ['卒', '兵'],
}

/** Pieces this side has taken (in the opponent's color) and, for the side ahead, its lead in points (덤 included). */
function MaterialLine({ side, captured, lead }: { side: "cho" | "han"; captured: string[]; lead: number }) {
  const victim = side === 'cho' ? 1 : 0 // index into [초, 한] hanja / colors
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
  return (
    <div className="material" title="점수 차이 (한의 덤 1.5 포함)">
      {captured.map((t, i) => (
        <span key={i} className={`cap-piece ${victim ? "han" : "cho"} ${t} ${captured[i - 1] === t ? "same" : ""}`}>
          {CAPTURED_HANJA[t][victim]}
        </span>
      ))}
      {lead > 0 && <span className="lead">+{fmt(lead)}</span>}
    </div>
  )
}

/** True while the physical key `code` (e.g. "KeyF") is held: momentary, not a toggle. Using the
 * key position keeps it working with the Korean IME (where f types ㄹ) and Caps Lock. */
export function useHeldKey(code: string, active: boolean) {
  const [held, setHeld] = useState(false)
  useEffect(() => {
    if (!active) return setHeld(false)
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement
    // Remote-desktop tools may turn a held key into rapid up/down pairs; a release only counts
    // if the key stays up briefly, so the board does not flicker under the mouse.
    let release = 0
    const down = (e: KeyboardEvent) => {
      if (e.code !== code || typing(e) || e.metaKey || e.ctrlKey) return
      clearTimeout(release)
      setHeld(true)
    }
    const up = (e: KeyboardEvent) => {
      if (e.code !== code) return
      clearTimeout(release)
      release = window.setTimeout(() => setHeld(false), 100)
    }
    const reset = () => {
      clearTimeout(release)
      setHeld(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener("blur", reset)
      clearTimeout(release)
    }
  }, [code, active])
  return held
}
