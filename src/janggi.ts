// Janggi rules (via ffish) and chess-style move notation.
import Module, { type FairyStockfish, type Board } from 'ffish-es6'

// "Modern" rules: no bikjang, material counting, Kakao-compatible repetition rules
export const VARIANT = 'janggimodern'
export const FILES = 'abcdefghi'

let ffish: FairyStockfish | null = null

export async function loadRules(opts: Parameters<typeof Module>[0] = { locateFile: (f: string) => '/engine/' + f }): Promise<FairyStockfish> {
  if (!ffish) ffish = await Module(opts)
  return ffish
}

export function withBoard<T>(fen: string, fn: (b: Board) => T): T {
  const b = new ffish!.Board(VARIANT, fen)
  try {
    return fn(b)
  } finally {
    b.delete()
  }
}

// --- squares & pieces -------------------------------------------------------

export interface Square {
  file: number // 0..8 (a..i)
  rank: number // 1..10, 초 starts on rank 1
}

export const sqName = (s: Square) => FILES[s.file] + s.rank
export const parseSq = (name: string): Square => ({ file: FILES.indexOf(name[0]), rank: +name.slice(1) })

export function parseUci(uci: string): { from: string; to: string } {
  const m = /^([a-i]\d+)([a-i]\d+)$/.exec(uci)
  if (!m) throw new Error(`bad move ${uci}`)
  return { from: m[1], to: m[2] }
}

export const isPass = (uci: string) => {
  const { from, to } = parseUci(uci)
  return from === to
}

/** Map of square name -> FEN piece char (uppercase = 초, lowercase = 한). */
export function parsePieces(fen: string): Map<string, string> {
  const out = new Map<string, string>()
  const rows = fen.split(' ')[0].split('/')
  rows.forEach((row, i) => {
    const rank = 10 - i
    let file = 0
    for (let j = 0; j < row.length; j++) {
      const c = row[j]
      if (/\d/.test(c)) {
        let n = c
        while (j + 1 < row.length && /\d/.test(row[j + 1])) n += row[++j]
        file += +n
      } else {
        out.set(FILES[file] + rank, c)
        file++
      }
    }
  })
  return out
}

export const choToMove = (fen: string) => fen.split(' ')[1] === 'w'
export const isCho = (piece: string) => piece === piece.toUpperCase()

// FEN letter -> notation letter. 졸/병 has none, like chess pawns.
const LETTER: Record<string, string> = { k: 'K', a: 'A', b: 'E', n: 'H', r: 'R', c: 'C', p: '' }

export const HANJA: Record<string, [string, string]> = {
  // [초, 한]
  k: ['楚', '漢'],
  a: ['士', '士'],
  b: ['象', '象'],
  n: ['馬', '馬'],
  r: ['車', '車'],
  c: ['包', '包'],
  p: ['卒', '兵'],
}

// --- notation -----------------------------------------------------------------

/** Chess-style SAN for a legal move in `b`'s current position (b is left unchanged). */
export function sanOf(b: Board, uci: string, legal: string[] = b.legalMoves().split(' ')): string {
  const { from, to } = parseUci(uci)
  if (from === to) return 'pass'
  const pieces = parsePieces(b.fen())
  const piece = pieces.get(from)!
  const type = piece.toLowerCase()
  const capture = pieces.has(to)

  const others = legal
    .filter((m) => m !== uci)
    .map(parseUci)
    .filter((m) => m.to === to && m.from !== m.to && pieces.get(m.from) === piece)
    .map((m) => parseSq(m.from))
  const f = parseSq(from)
  let dis = ''
  if (type === 'p' && capture) dis = FILES[f.file]
  if (others.length) {
    const sameFile = others.some((o) => o.file === f.file)
    const sameRank = others.some((o) => o.rank === f.rank)
    if (type === 'p') dis = sameFile ? from : FILES[f.file]
    else if (!sameFile) dis = FILES[f.file]
    else if (!sameRank) dis = String(f.rank)
    else dis = from
  }

  let san = LETTER[type] + dis + (capture ? 'x' : '') + to
  b.push(uci)
  if (b.isCheck()) san += b.numberLegalMoves() === 0 ? '#' : '+'
  b.pop()
  return san
}

/** SAN for a whole line starting at `fen`; stops at the first illegal move. */
export function lineSan(fen: string, ucis: string[], max = ucis.length): string[] {
  return withBoard(fen, (b) => {
    const out: string[] = []
    for (const m of ucis.slice(0, max)) {
      const legal = b.legalMoves().split(' ')
      if (!legal.includes(m)) break
      out.push(sanOf(b, m, legal))
      b.push(m)
    }
    return out
  })
}

// --- setups (차림) --------------------------------------------------------------

export const SETUPS = ['마상상마', '상마마상', '마상마상', '상마상마'] as const
export type Setup = (typeof SETUPS)[number]

/** Back rank for one side. The setup name is read from that player's own left. */
function backRank(setup: Setup, cho: boolean): string {
  const fromLeft = [...setup].map((c) => (c === '마' ? 'n' : 'b'))
  const [b, c, g, h] = cho ? fromLeft : [...fromLeft].reverse()
  const row = `r${b}${c}a1a${g}${h}r`
  return cho ? row.toUpperCase() : row
}

export function startFen(cho: Setup, han: Setup): string {
  return `${backRank(han, false)}/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/${backRank(cho, true)} w - - 0 1`
}

// --- evaluation helpers ----------------------------------------------------------

/** Score from 초's point of view. */
export function choScore(fen: string, line: { cp?: number; mate?: number }) {
  const sign = choToMove(fen) ? 1 : -1
  return line.mate !== undefined ? { mate: sign * line.mate } : { cp: sign * (line.cp ?? 0) }
}

export function formatScore(s: { cp?: number; mate?: number }): string {
  if (s.mate !== undefined) return (s.mate > 0 ? '+' : '-') + 'M' + Math.abs(s.mate)
  const v = (s.cp ?? 0) / 100
  return (v > 0 ? '+' : '') + v.toFixed(2)
}

/** 초's share of the eval bar, 0..100. */
export function barPercent(s: { cp?: number; mate?: number }): number {
  if (s.mate !== undefined) return s.mate > 0 ? 100 : 0
  const cp = s.cp ?? 0
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
}

/** Replays UCI moves from `fen`, returning SAN and the position after each move. */
export function replay(fen: string, ucis: string[]) {
  return withBoard(fen, (b) =>
    ucis.map((uci) => {
      const san = sanOf(b, uci)
      b.push(uci)
      return { uci, san, fen: b.fen() }
    }),
  )
}

// --- material (점수) -----------------------------------------------------------------

export const PIECE_POINTS: Record<string, number> = { r: 13, c: 7, n: 5, b: 3, a: 3, p: 2, k: 0 }
export const KOMI = 1.5 // 덤 for 한
/** A game that reaches this many moves (both sides together, passes included) is decided on points */
export const MAX_PLIES = 200
/** A side with this many points or fewer on the board (덤 not counted) ends the game: decided on points */
export const LOW_POINTS = 10
const START_COUNT: Record<string, number> = { k: 1, a: 2, b: 2, n: 2, r: 2, c: 2, p: 5 }
const CAPTURE_ORDER = ['r', 'c', 'n', 'b', 'a', 'p']

export interface SideMaterial {
  score: number // remaining material, 한 includes 덤
  captured: string[] // opponent piece types this side has taken, most valuable first
}

/** Points left on the board for each side (with 덤) and which pieces each side has captured. */
export function material(fen: string): { cho: SideMaterial; han: SideMaterial } {
  const left = { cho: { ...START_COUNT }, han: { ...START_COUNT } }
  const have = { cho: 0, han: KOMI }
  for (const p of parsePieces(fen).values()) {
    const side = isCho(p) ? 'cho' : 'han'
    const t = p.toLowerCase()
    have[side] += PIECE_POINTS[t]
    left[side][t]--
  }
  const taken = (victim: 'cho' | 'han') =>
    CAPTURE_ORDER.flatMap((t) => Array.from({ length: Math.max(0, left[victim][t]) }, () => t))
  return {
    cho: { score: have.cho, captured: taken('han') },
    han: { score: have.han, captured: taken('cho') },
  }
}

export type GameResult = '1-0' | '0-1' | '1/2-1/2'

/** "1-0 (초 승)" style, as shown at the end of the move list. */
export function resultLabel(r: GameResult, reason?: string | null) {
  const head = r === '1-0' ? '1-0 (초 승)' : r === '0-1' ? '0-1 (한 승)' : '½-½ (무승부)'
  return reason ? `${head} · ${reason}` : head
}

/** FEN placement field from a square -> piece map. */
function placement(pieces: Map<string, string>) {
  const rows: string[] = []
  for (let rank = 10; rank >= 1; rank--) {
    let row = ''
    let empty = 0
    for (let f = 0; f < 9; f++) {
      const p = pieces.get(FILES[f] + rank)
      if (p) {
        if (empty) row += empty
        row += p
        empty = 0
      } else empty++
    }
    rows.push(row + (empty ? empty : ''))
  }
  return rows.join('/')
}

/** Moves a piece without checking any rules (for drawing premoves). Side to move is left as is. */
export function moveRaw(fen: string, uci: string): string {
  const { from, to } = parseUci(uci)
  const pieces = parsePieces(fen)
  const p = pieces.get(from)
  if (!p || from === to) return fen
  pieces.delete(from)
  pieces.set(to, p)
  const parts = fen.split(' ')
  parts[0] = placement(pieces)
  return parts.join(' ')
}

/**
 * Where `side` could premove in `fen`, as if it were their turn: the normal moves, plus moves onto
 * their own pieces (a recapture, in case the opponent takes there first).
 */
export function premoveTargets(fen: string, side: 'cho' | 'han'): string[] {
  const parts = fen.split(' ')
  parts[1] = side === 'cho' ? 'w' : 'b'
  const mine = parts.join(' ')
  const legal = (f: string) => {
    try {
      return withBoard(f, (b) => b.legalMoves().split(' ').filter((m) => m && !isPass(m)))
    } catch {
      return []
    }
  }
  const out = new Set(legal(mine))
  const pieces = parsePieces(mine)
  const enemyPawn = side === 'cho' ? 'p' : 'P'
  for (const [sq, p] of pieces) {
    if (isCho(p) !== (side === 'cho') || p.toLowerCase() === 'k') continue
    // pretend an enemy piece stands there (a soldier: every piece, even a cannon, may take it)
    const trial = new Map(pieces)
    trial.set(sq, enemyPawn)
    const f = mine.split(' ')
    f[0] = placement(trial)
    for (const m of legal(f.join(' '))) if (parseUci(m).to === sq) out.add(m)
  }
  return [...out]
}

/** Decision on points: the side with more points left (한 with 덤) wins; 덤 rules out a tie. */
export function pointsResult(fen: string): { result: GameResult; score: string } {
  const m = material(fen)
  const fmt = (x: number) => String(x)
  return { result: m.cho.score > m.han.score ? '1-0' : '0-1', score: `${fmt(m.cho.score)} : ${fmt(m.han.score)}` }
}

/**
 * Both sides passed in a row: the game ends and is decided on points. Checked on the move list because a board
 * built from a FEN does not know the move before it (the rules engine only sees passes played on the same board).
 */
export const passedTwice = (ucis: string[]) => ucis.length >= 2 && isPass(ucis[ucis.length - 1]) && isPass(ucis[ucis.length - 2])

/**
 * Whether the move just played ends the game on points (카카오 장기 rules), and why: both sides passed in a row,
 * a side is down to LOW_POINTS points or fewer (덤 not counted), or MAX_PLIES moves were played (the game ends right
 * there). `line` is every move so far, the last one included; `after` the position it reached.
 */
export function pointsEnding(line: string[], after: string): { result: GameResult; reason: string } | null {
  const m = material(after)
  const why = passedTwice(line)
    ? '양쪽 한수쉼'
    : m.cho.score <= LOW_POINTS || m.han.score - KOMI <= LOW_POINTS
      ? `${LOW_POINTS}점 이하`
      : line.length >= MAX_PLIES
        ? `${MAX_PLIES}수`
        : null
  if (!why) return null
  const p = pointsResult(after)
  return { result: p.result, reason: `${why} · 점수 ${p.score}` }
}

// --- the whole game: repetition and the end of a game ------------------------------------------
// The repetition rules are the rules engine's (janggimodern, made to match 카카오 장기): moving a piece back and forth
// to repeat the same move a third time loses, so does checking over and over, and a position that comes up a fourth
// time is decided on points. The engine can only judge them on a board that has the game's moves, so these functions
// replay the game from its start. A move that would lose on the spot this way is simply not offered, the way a move
// may not leave one's own 궁 in check. Points endings that the engine does not have (two passes, 10 points, 200
// moves) are in pointsEnding above.

/** Board and side to move: what counts as "the same position" */
export const positionOf = (fen: string) => fen.split(' ').slice(0, 2).join(' ')

/** Runs fn on a board that has played the whole game, so the rules engine sees its history */
export function withGame<T>(start: string, ucis: string[], fn: (b: Board) => T): T {
  return withBoard(start, (b) => {
    for (const u of ucis) b.push(u)
    return fn(b)
  })
}

/** On a board with history: the move just played loses by the repetition rules (not a position's fourth time) */
function repetitionLoss(b: Board, seen: Map<string, number>) {
  if (b.isGameOver() || !b.isGameOver(true)) return false
  if ((seen.get(positionOf(b.fen())) ?? 0) >= 3) return false // a fourth time: decided on points, not lost
  const moverCho = !choToMove(b.fen())
  return b.result(true) === (moverCho ? '0-1' : '1-0')
}

function positionCounts(start: string, ucis: string[]) {
  const seen = new Map<string, number>()
  replay(start, ucis).reduce((m, p) => m.set(positionOf(p.fen), (m.get(positionOf(p.fen)) ?? 0) + 1), seen.set(positionOf(start), 1))
  return seen
}

/** Legal moves after the game's moves, without the ones that would lose on the spot by the repetition rules */
export function legalMoves(start: string, ucis: string[]): string[] {
  const seen = positionCounts(start, ucis)
  return withGame(start, ucis, (b) =>
    b
      .legalMoves()
      .split(' ')
      .filter(Boolean)
      .filter((u) => {
        b.push(u)
        const lost = repetitionLoss(b, seen)
        b.pop()
        return !lost
      }),
  )
}

/** Whether the game is over after its last move, how and with what result */
export function gameEnd(start: string, ucis: string[]): { result: GameResult; reason: string } | null {
  if (!ucis.length) return null
  const seen = positionCounts(start, ucis)
  return withGame(start, ucis, (b) => {
    const fen = b.fen()
    if (b.isGameOver() && b.isCheck() && b.numberLegalMoves() === 0) return { result: b.result() as GameResult, reason: '외통' }
    const points = pointsEnding(ucis, fen)
    if (points) return points
    if (b.isGameOver()) return { result: b.result() as GameResult, reason: '규칙' }
    if (b.isGameOver(true)) {
      const fourth = (seen.get(positionOf(fen)) ?? 0) >= 4
      return { result: b.result(true) as GameResult, reason: fourth ? `동형 반복 · 점수 ${pointsResult(fen).score}` : '반복 수' }
    }
    // every move left would lose by repetition (in check, every escape repeats): like being mated
    if (!legalMoves(start, ucis).length) return { result: choToMove(fen) ? '0-1' : '1-0', reason: '둘 수 없음 (반복)' }
    return null
  })
}

/**
 * What the engine is told about a position, and the key its evaluation is stored under: the position up to
 * ENGINE_HISTORY moves back (or right after the last capture, as no position before a capture can come back) and the
 * moves since, as in "position fen <key>". With no moves since, it is just the FEN.
 * `path` is the moves that led to the position (at least the last ENGINE_HISTORY), each with the position after it.
 */
export const ENGINE_HISTORY = 12
export function engineKey(start: string, path: { uci: string; fen: string }[]): string {
  let j = path.length
  while (j > 0 && path.length - j < ENGINE_HISTORY) {
    const m = path[j - 1]
    const before = j > 1 ? path[j - 2].fen : start
    if (!isPass(m.uci) && parsePieces(before).has(parseUci(m.uci).to)) break
    j--
  }
  const from = j > 0 ? path[j - 1].fen : start
  const moves = path.slice(j).map((m) => m.uci)
  return moves.length ? `${from} moves ${moves.join(' ')}` : from
}

/** The position a key stands for */
export const keyFen = (key: string) => {
  const [fen, moves] = key.split(' moves ')
  return moves ? replay(fen, moves.split(' ')).at(-1)!.fen : fen
}

/** Keys of every position of a game: the start and the position after each move */
export function gameKeys(start: string, ucis: string[]): string[] {
  const path = replay(start, ucis)
  return [start, ...path.map((_, i) => engineKey(start, path.slice(0, i + 1)))]
}

/** A key whose position ends the game on the board (외통 and such): its result and FEN */
export function keyResult(key: string): { result: GameResult; fen: string } | null {
  const [from, moves] = key.split(' moves ')
  return withBoard(from, (b) => {
    for (const m of moves?.split(' ') ?? []) b.push(m)
    return b.isGameOver() ? { result: b.result() as GameResult, fen: b.fen() } : null
  })
}

