// Game Review: chess.com-style move classification from fixed-depth evaluations.
//
// Everything is measured in expected points (win probability, 0..1) for the player who moved.
// Loss = expected points with the engine's best move - expected points after the played move.
import type { EngineLine } from './engine'
import { choToMove, isCho, parsePieces, parseUci, withBoard } from "./janggi"

export type MoveClass =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder'

export const CLASS_INFO: Record<MoveClass, { label: string; color: string }> = {
  brilliant: { label: '탁월한 수', color: '#26c2a3' },
  great: { label: '훌륭한 수', color: '#749bbf' },
  best: { label: '최선의 수', color: '#81b64c' },
  excellent: { label: '뛰어난 수', color: '#81b64c' },
  good: { label: '좋은 수', color: '#95b776' },
  book: { label: '이론에 있는 수', color: '#d5a47d' },
  inaccuracy: { label: '부정확한 수', color: '#f7c631' },
  mistake: { label: '실수', color: '#ffa459' },
  miss: { label: '놓친 수', color: '#ff7769' },
  blunder: { label: '블런더', color: '#fa412d' },
}

/** Rows of the summary table, in chess.com's order (no opening book for janggi, so no 이론에 있는 수). */
export const SUMMARY_ORDER: MoveClass[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
]

/** Engine result for one position. Lines are from the side to move's point of view. */
export interface PosEval {
  lines: EngineLine[]
  /** Set when the game is over in this position: expected points for the side to move. */
  terminal?: number
}

export const REVIEW_DEPTH = 16
export const REVIEW_MULTIPV = 2

const PIECE_VALUE: Record<string, number> = { r: 13, c: 7, n: 5, b: 3, a: 3, p: 2, k: 0 }

/** Expected points for the side to move. */
export function winOf(line: { cp?: number; mate?: number } | undefined): number {
  if (!line) return 0.5
  if (line.mate !== undefined) return line.mate > 0 ? 1 : 0
  return 1 / (1 + Math.exp(-0.00368208 * (line.cp ?? 0)))
}

export const posWin = (e: PosEval) => e.terminal ?? winOf(e.lines[0])

/** Expected points for 초 in a position. */
export const choWin = (fen: string, e: PosEval) => (choToMove(fen) ? posWin(e) : 1 - posWin(e))

function material(fen: string, cho: boolean) {
  let sum = 0
  for (const p of parsePieces(fen).values()) sum += (isCho(p) === cho ? 1 : -1) * PIECE_VALUE[p.toLowerCase()]
  return sum
}

/**
 * Material the mover is down after the move and the engine's best continuation (4 plies),
 * i.e. how much they gave away. Positive = sacrificed.
 */
function sacrificed(before: string, uci: string, reply: string[], cho: boolean): number {
  return withBoard(before, (b) => {
    const start = material(before, cho)
    b.push(uci)
    for (const m of reply.slice(0, 4)) {
      if (!b.legalMoves().split(' ').includes(m)) break
      b.push(m)
    }
    return start - material(b.fen(), cho)
  })
}

export interface MoveReview {
  cls: MoveClass
  loss: number
  accuracy: number // 0..100, lichess-style per-move accuracy
  winBefore: number // mover's expected points with best play
  winAfter: number // mover's expected points after the played move
  best?: string // engine's best move in the position before
  bestLine: string[]
  isBest: boolean
}

export function moveAccuracy(lossPoints: number) {
  const a = 103.1668 * Math.exp(-0.04354 * lossPoints * 100) - 3.1669
  return Math.max(0, Math.min(100, a))
}

export interface PrevMove {
  uci: string
  before: string // position the previous move was played in
  review: MoveReview | null
}

/** Classifies one move; `prev` is the opponent's move just before it, if any. */
export function reviewMove(
  before: string,
  uci: string,
  after: string,
  prev: PrevMove | null,
  evals: Record<string, PosEval>,
): MoveReview | null {
  {
    const eb = evals[before]
    const ea = evals[after]
    if (!eb || !ea) return null
    const cho = choToMove(before)
    const winBefore = posWin(eb)
    const winAfter = 1 - posWin(ea)
    const loss = Math.max(0, winBefore - winAfter)
    const best = eb.lines[0]?.pv[0]
    const isBest = uci === best || eb.lines.length === 1 // a forced move is always best
    const second = eb.lines.find((l) => l.pv[0] !== uci && l.multipv > 1) ?? (isBest ? eb.lines[1] : undefined)
    // taking back on the square the opponent just captured on is obvious, never 훌륭한/탁월한 수
    const to = parseUci(uci).to
    const recapture = !!prev && parseUci(prev.uci).to === to && parsePieces(prev.before).has(to)

    let cls: MoveClass
    if (isBest || loss < 0.001) cls = 'best'
    else if (loss <= 0.02) cls = 'excellent'
    else if (loss <= 0.05) cls = 'good'
    else if (loss <= 0.1) cls = 'inaccuracy'
    else if (loss <= 0.2) cls = 'mistake'
    else cls = 'blunder'

    // 놓친 수: the opponent just erred and this move lets the chance go.
    if (prev?.review && prev.review.loss >= 0.1 && loss >= 0.05 && !(cls === 'blunder' && winAfter < 0.5)) cls = 'miss'

    if ((cls === "best" || cls === "excellent") && !recapture) {
      const reply = ea.lines[0]?.pv ?? []
      if (winAfter >= 0.5 && sacrificed(before, uci, reply, cho) >= 3) {
        cls = 'brilliant'
      } else if (isBest && second) {
        // 훌륭한 수: the only move that keeps the result; everything else is clearly worse.
        const winSecond = winOf(second)
        if (winBefore - winSecond >= 0.1 && winSecond < 0.9 && winAfter >= 0.3) cls = 'great'
      }
    }

    return {
      cls,
      loss,
      accuracy: moveAccuracy(loss),
      winBefore,
      winAfter,
      best,
      bestLine: eb.lines[0]?.pv ?? [],
      isBest: cls === 'best' || cls === 'great' || cls === 'brilliant' || isBest,
    }
  }
}

export function reviewGame(
  start: string,
  plies: { uci: string; fen: string }[],
  evals: Record<string, PosEval>,
): (MoveReview | null)[] {
  const out: (MoveReview | null)[] = []
  plies.forEach((p, i) => {
    const before = i === 0 ? start : plies[i - 1].fen
    const prev = i === 0 ? null : { uci: plies[i - 1].uci, before: i > 1 ? plies[i - 2].fen : start, review: out[i - 1] }
    out.push(reviewMove(before, p.uci, p.fen, prev, evals))
  })
  return out
}

export interface Summary {
  accuracy: { cho: number | null; han: number | null }
  counts: { cho: Record<MoveClass, number>; han: Record<MoveClass, number> }
}

export function summarize(start: string, plies: { fen: string }[], reviews: (MoveReview | null)[]): Summary {
  const zero = () => Object.fromEntries(Object.keys(CLASS_INFO).map((k) => [k, 0])) as Record<MoveClass, number>
  const counts = { cho: zero(), han: zero() }
  const accs: { cho: number[]; han: number[] } = { cho: [], han: [] }
  reviews.forEach((r, i) => {
    if (!r) return
    const before = i === 0 ? start : plies[i - 1].fen
    const side = choToMove(before) ? 'cho' : 'han'
    counts[side][r.cls]++
    accs[side].push(r.accuracy)
  })
  const mean = (a: number[]) => {
    if (!a.length) return null
    // like lichess: average of the arithmetic and harmonic means, so a few bad moves weigh more
    const arith = a.reduce((s, x) => s + x, 0) / a.length
    const harm = a.length / a.reduce((s, x) => s + 1 / Math.max(x, 1), 0)
    return (arith + harm) / 2
  }
  return { accuracy: { cho: mean(accs.cho), han: mean(accs.han) }, counts }
}
