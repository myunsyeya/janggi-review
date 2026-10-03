import { useMemo, useRef, useState } from 'react'
import { classGlyph } from "./icons"
import type { MoveClass } from "./review"
import { FILES, HANJA, choToMove, isCho, parsePieces, parseSq, parseUci } from './janggi'

const M = 0.95 // margin around the grid, in grid units
const W = 8 + 2 * M
const H = 9 + 2 * M

const PIECE_R: Record<string, number> = { k: 0.47, r: 0.4, c: 0.4, n: 0.4, b: 0.4, a: 0.31, p: 0.31 }

export interface Arrow {
  from: string
  to: string
  color: string
}

interface Props {
  fen: string
  legal: string[]
  flipped: boolean
  lastMove?: string
  lastMoveColor?: string
  badge?: MoveClass
  arrows: Arrow[]
  interactive: boolean
  mover?: "cho" | "han" // whose pieces can be picked up (default: side to move; differs for premoves)
  premoves?: string[] // queued premoves; the shown fen already has them applied
  onCancel?: () => void
  onMove: (uci: string) => void
  /** controlled right-click drawings (the study editor keeps them per move); otherwise the board keeps its own */
  drawn?: Arrow[]
  onDraw?: (shapes: Arrow[]) => void
}

function octagon(r: number) {
  const pts: string[] = []
  for (let k = 0; k < 8; k++) {
    const a = ((22.5 + 45 * k) * Math.PI) / 180
    pts.push(`${(r * Math.cos(a)).toFixed(3)},${(r * Math.sin(a)).toFixed(3)}`)
  }
  return pts.join(' ')
}

export default function Board({
  fen,
  legal,
  flipped,
  lastMove,
  lastMoveColor,
  badge,
  arrows,
  interactive,
  onMove,
  mover,
  premoves = [],
  onCancel,
  drawn,
  onDraw,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ sq: string; x: number; y: number; moved: boolean } | null>(null)

  const pieces = useMemo(() => parsePieces(fen), [fen])
  const choTurn = choToMove(fen)

  // right-click drawings (arrows, and circles when from === to)
  const [ownShapes, setOwnShapes] = useState<Arrow[]>([])
  const shapes = onDraw ? (drawn ?? []) : ownShapes
  const setShapes = (next: Arrow[]) => (onDraw ? undefined : setOwnShapes(next))
  const [drawStart, setDrawStart] = useState<{ sq: string; color: string } | null>(null)
  const toggleShape = (s: Arrow) => {
    const same = shapes.find((a) => a.from === s.from && a.to === s.to)
    const rest = shapes.filter((a) => a !== same)
    const next = same && same.color === s.color ? rest : [...rest, s]
    if (onDraw) onDraw(next)
    else setOwnShapes(next)
  }

  // reset selection and drawings when the position changes
  const [lastFen, setLastFen] = useState(fen)
  if (lastFen !== fen) {
    setLastFen(fen)
    setSelected(null)
    setDrag(null)
    setShapes([])
  }

  const pos = (name: string) => {
    const s = parseSq(name)
    return flipped ? { x: M + (8 - s.file), y: M + (s.rank - 1) } : { x: M + s.file, y: M + (10 - s.rank) }
  }

  const toSvg = (e: React.PointerEvent) => {
    const pt = svgRef.current!.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    return pt.matrixTransform(svgRef.current!.getScreenCTM()!.inverse())
  }

  const squareAt = (x: number, y: number): string | null => {
    let f = Math.round(x - M)
    let r = 10 - Math.round(y - M)
    if (flipped) {
      f = 8 - f
      r = 11 - r
    }
    if (f < 0 || f > 8 || r < 1 || r > 10) return null
    return FILES[f] + r
  }

  const targets = useMemo(() => {
    if (!selected) return new Set<string>()
    return new Set(
      legal
        .map(parseUci)
        .filter((m) => m.from === selected && m.to !== m.from)
        .map((m) => m.to),
    )
  }, [selected, legal])

  const ownPiece = (sq: string | null) => {
    const p = sq && pieces.get(sq)
    return !!p && isCho(p) === (mover ? mover === "cho" : choTurn)
  }

  const tryMove = (from: string, to: string) => {
    const uci = from + to
    if (from !== to && legal.includes(uci)) {
      onMove(uci)
      return true
    }
    return false
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const p = toSvg(e)
    const sq = squareAt(p.x, p.y)
    if (e.button === 2) {
      if (premoves.length && onCancel) return onCancel() // right-click cancels the premoves
      if (sq) setDrawStart({ sq, color: drawColor(e) })
      return
    }
    if (e.button !== 0) return
    setShapes([])
    if (!interactive || !sq) return
    if (selected && targets.has(sq)) {
      tryMove(selected, sq)
      setSelected(null)
      return
    }
    if (ownPiece(sq)) {
      setSelected(sq)
      setDrag({ sq, x: p.x, y: p.y, moved: false })
      svgRef.current!.setPointerCapture(e.pointerId)
    } else {
      setSelected(null)
      onCancel?.()
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return
    const p = toSvg(e)
    setDrag({ ...drag, x: p.x, y: p.y, moved: true })
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const p = toSvg(e)
    const sq = squareAt(p.x, p.y)
    if (e.button === 2) {
      if (drawStart && sq) toggleShape({ from: drawStart.sq, to: sq, color: drawStart.color })
      setDrawStart(null)
      return
    }
    if (!drag) return
    setDrag(null)
    if (sq && sq !== drag.sq && tryMove(drag.sq, sq)) setSelected(null)
  }

  const highlight = (sq: string, color: string) => {
    const { x, y } = pos(sq)
    return <rect key={'h' + sq + color} x={x - 0.5} y={y - 0.5} width={1} height={1} fill={color} />
  }

  const last = lastMove ? parseUci(lastMove) : null
  // where premoved pieces stand now (drawn see-through until the moves are really played)
  const ghosts = useMemo(() => {
    const at = new Set<string>()
    for (const m of premoves) {
      const { from, to } = parseUci(m)
      at.delete(from)
      at.add(to)
    }
    return at
  }, [premoves])

  const renderPiece = (sq: string, piece: string, at?: { x: number; y: number }) => {
    const { x, y } = at ?? pos(sq)
    const t = piece.toLowerCase()
    const cho = isCho(piece)
    const r = PIECE_R[t]
    const color = cho ? 'var(--cho)' : 'var(--han)'
    return (
      <g key={sq} transform={`translate(${x},${y})`} className={`piece ${ghosts.has(sq) && !at ? "ghost" : ""}`}>
        <polygon points={octagon(r)} fill="var(--piece-face)" stroke="var(--piece-edge)" strokeWidth={0.035} />
        <polygon points={octagon(r * 0.84)} fill="none" stroke={color} strokeWidth={0.025} />
        <text
          y={r * 0.04}
          fontSize={r * 1.15}
          fill={color}
          textAnchor="middle"
          dominantBaseline="central"
          className="hanja"
        >
          {HANJA[t][cho ? 0 : 1]}
        </text>
      </g>
    )
  }

  const palace = (r0: number) => {
    const a = pos(`d${r0}`)
    const b = pos(`f${r0 + 2}`)
    return [
      <line key={'p1' + r0} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />,
      <line key={'p2' + r0} x1={b.x} y1={a.y} x2={a.x} y2={b.y} />,
    ]
  }

  return (
    <svg
      ref={svgRef}
      className="board"
      viewBox={`0 0 ${W} ${H}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <rect x={0} y={0} width={W} height={H} rx={0.12} fill="var(--board)" />
      <g stroke="var(--grid)" strokeWidth={0.03}>
        {Array.from({ length: 10 }, (_, i) => (
          <line key={'r' + i} x1={M} y1={M + i} x2={M + 8} y2={M + i} />
        ))}
        {Array.from({ length: 9 }, (_, i) => (
          <line key={'f' + i} x1={M + i} y1={M} x2={M + i} y2={M + 9} />
        ))}
        {palace(1)}
        {palace(8)}
        <rect x={M} y={M} width={8} height={9} fill="none" strokeWidth={0.06} />
      </g>

      <g className="coords" fontSize={0.26} fill="var(--coord)">
        {Array.from({ length: 9 }, (_, f) => {
          const { x } = pos(FILES[f] + 1)
          return (
            <text key={'cf' + f} x={x} y={H - 0.14} textAnchor="middle">
              {FILES[f]}
            </text>
          )
        })}
        {Array.from({ length: 10 }, (_, i) => {
          const { y } = pos('a' + (i + 1))
          return (
            <text key={'cr' + i} x={0.26} y={y} textAnchor="middle" dominantBaseline="central">
              {i + 1}
            </text>
          )
        })}
      </g>

      {last && highlight(last.from, lastMoveColor ?? "var(--last)")}
      {last && last.to !== last.from && highlight(last.to, lastMoveColor ?? "var(--last)")}
      {[...new Set(premoves.flatMap((m) => [parseUci(m).from, parseUci(m).to]))].map((sq) => highlight(sq, "var(--premove)"))}
      {selected && highlight(selected, 'var(--sel)')}

      {[...pieces].map(([sq, p]) => (drag?.moved && drag.sq === sq ? null : renderPiece(sq, p)))}

      {[...targets].map((sq) => {
        const { x, y } = pos(sq)
        return pieces.has(sq) ? (
          <circle key={'t' + sq} cx={x} cy={y} r={0.44} fill="none" stroke="var(--hint)" strokeWidth={0.08} />
        ) : (
          <circle key={'t' + sq} cx={x} cy={y} r={0.15} fill="var(--hint)" />
        )
      })}

      <g pointerEvents="none">
        {shapes
          .filter((s) => s.from === s.to)
          .map((s) => {
            const { x, y } = pos(s.from)
            return <circle key={"c" + s.from} cx={x} cy={y} r={0.46} fill="none" stroke={s.color} strokeWidth={0.07} opacity={0.85} />
          })}
        {[...arrows, ...shapes.filter((s) => s.from !== s.to)].map((a, i) => {
          const p = pos(a.from)
          const q = pos(a.to)
          const dx = q.x - p.x
          const dy = q.y - p.y
          const len = Math.hypot(dx, dy)
          if (len === 0) {
            // a circle (from === to), e.g. a highlighted square from a study
            return <circle key={'a' + i} cx={p.x} cy={p.y} r={0.46} fill="none" stroke={a.color} strokeWidth={0.07} opacity={0.85} />
          }
          const ux = dx / len
          const uy = dy / len
          const head = 0.42
          const ex = q.x - ux * head
          const ey = q.y - uy * head
          const px = -uy * 0.25
          const py = ux * 0.25
          return (
            <g key={'a' + i} opacity={0.8}>
              <line
                x1={p.x + ux * 0.15}
                y1={p.y + uy * 0.15}
                x2={ex}
                y2={ey}
                stroke={a.color}
                strokeWidth={0.18}
                strokeLinecap="butt"
              />
              <polygon points={`${q.x},${q.y} ${ex + px},${ey + py} ${ex - px},${ey - py}`} fill={a.color} />
            </g>
          )
        })}
      </g>

      {last && badge && (() => {
        const { x, y } = pos(last.to)
        return (
          <svg x={x + 0.18} y={y - 0.68} width={0.5} height={0.5} viewBox="0 0 24 24" pointerEvents="none">
            {classGlyph(badge)}
          </svg>
        )
      })()}

      {drag?.moved && renderPiece('drag', pieces.get(drag.sq)!, { x: drag.x, y: drag.y })}
    </svg>
  )
}

// chess.com-like: plain right-drag is orange; Shift green, Ctrl red, Alt blue.
function drawColor(e: React.PointerEvent) {
  if (e.shiftKey) return 'var(--draw-green)'
  if (e.ctrlKey || e.metaKey) return 'var(--draw-red)'
  if (e.altKey) return 'var(--draw-blue)'
  return 'var(--draw-orange)'
}
