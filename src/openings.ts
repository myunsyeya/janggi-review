// Opening (포진) recognition. Janggi openings are named mostly by where the horses, elephants and
// cannons settle, so we follow the pieces through the first moves instead of matching move orders.
//
// Coordinates are "relative" to each side: files a–i as on the board, rel rank 1 = that side's back rank.
// 귀 (palace corners toward the enemy) = d3/f3, 면 (front middle of the palace) = e3, 귀윗상 = d4/f4.
// Sources: 나무위키 「귀마 포진」「원앙마 포진」「장기/용어」, 위키책 「장기/초반 포진법」 (see /openings pages).
import { parsePieces, parseUci } from './janggi.ts'

export type Side = 'cho' | 'han'
export type Formation = '귀마' | '양귀마' | '원앙마' | '면상' | '양귀상'

export interface SideOpening {
  setup: string // 마상상마 … read from that player's own left
  formation: Formation
  cannon?: '정형포진' | '변형포진' // 엇상 귀마: which cannon went to 면
  chariot?: '최국수포진' | '김경만포진' // 후수 귀마: the 진마-side chariot to rel rank 2 / 5 after 초's 면포
  pawn?: '중앙병좌' | '좌진병상' | '좌진병좌' | '좌진병우' // 후수 귀마: first pawn move, "좌" = the 귀마 side
  keyPlies?: number[] // the pawn / chariot moves above
}

export interface Opening {
  name: string // e.g. "귀마 대 귀마: 엇상 · 최국수 포진"
  cho: SideOpening
  han: SideOpening
  matchup?: '맞상' | '엇상'
  named?: { title: string; page?: string } // famous line with its own name and page
  /** Plies (indices into the moves) that build the recognized formation: shown as 이론에 있는 수 in review. */
  book: Set<number>
}

const OPENING_PLIES = 40 // only the opening phase is classified
const rel = (side: Side, rank: number) => (side === 'cho' ? rank : 11 - rank)
const sq = (file: string, side: Side, relRank: number) => file + rel(side, relRank)

interface Tracked {
  type: string // fen letter, lower case
  side: Side
  home: string // starting square
  at: string | null // null once captured
  moves: { ply: number; to: string; capture: string | null }[]
}

/** Follows every piece through the moves, so "the cannon that started on b3" stays identifiable. */
function track(startFen: string, ucis: string[]) {
  const pieces: Tracked[] = []
  const at = new Map<string, Tracked>()
  for (const [square, p] of parsePieces(startFen)) {
    const t: Tracked = { type: p.toLowerCase(), side: p === p.toUpperCase() ? 'cho' : 'han', home: square, at: square, moves: [] }
    pieces.push(t)
    at.set(square, t)
  }
  ucis.slice(0, OPENING_PLIES).forEach((uci, ply) => {
    const { from, to } = parseUci(uci)
    if (from === to) return // pass
    const mover = at.get(from)
    if (!mover) return
    const victim = at.get(to) ?? null
    if (victim) victim.at = null
    at.delete(from)
    at.set(to, mover)
    mover.at = to
    mover.moves.push({ ply, to, capture: victim ? victim.type + (victim.side === 'cho' ? 'C' : 'H') : null })
  })
  return pieces
}

function setupName(startFen: string, side: Side) {
  const pieces = parsePieces(startFen)
  // from the player's own left: 초 reads b,c,g,h; 한 (sitting opposite) reads h,g,c,b
  const files = side === 'cho' ? ['b', 'c', 'g', 'h'] : ['h', 'g', 'c', 'b']
  return files.map((f) => (pieces.get(sq(f, side, 1))?.toLowerCase() === 'n' ? '마' : '상')).join('')
}

function classifySide(startFen: string, side: Side, pieces: Tracked[]): SideOpening {
  const mine = pieces.filter((p) => p.side === side)
  const start = parsePieces(startFen)
  const innerHorse = ['c', 'g'].filter((f) => start.get(sq(f, side, 1))?.toLowerCase() === 'n')
  const visited = (p: Tracked, square: string) => p.moves.some((m) => m.to === square)
  const elephants = mine.filter((p) => p.type === 'b')

  let formation: Formation
  if (innerHorse.length === 2) formation = '양귀마'
  else if (innerHorse.length === 0) {
    const both = [sq('d', side, 3), sq('f', side, 3)].every((s) => elephants.some((e) => visited(e, s)))
    formation = both ? '양귀상' : '원앙마'
  } else formation = '귀마'
  if (formation !== '양귀상' && elephants.some((e) => visited(e, sq('e', side, 3)))) formation = '면상'

  const result: SideOpening = { setup: setupName(startFen, side), formation }
  if (formation !== '귀마') return result

  // 귀마 side = the side of the inner horse (c → the b-cannon's side, g → the h-cannon's side)
  const gwimaLeft = innerHorse[0] === 'c'
  const face = sq('e', side, 3)
  const cannons = mine.filter((p) => p.type === 'c')
  const firstToFace = cannons
    .map((c) => ({ c, ply: c.moves.find((m) => m.to === face)?.ply }))
    .filter((x): x is { c: Tracked; ply: number } => x.ply !== undefined)
    .sort((a, b) => a.ply - b.ply)[0]
  if (!firstToFace) return result
  const fromLeft = firstToFace.c.home[0] === 'b'
  result.cannon = fromLeft === gwimaLeft ? '변형포진' : '정형포진'

  return result
}

/**
 * 후수(한) 귀마 sub-variations, after the DC 장기 갤러리 classification of 귀마 대 귀마 후수 포진 (2023-05-30):
 * which pawn moves first (좌 = the 귀마 side), and 최국수 — after 초's 면포 the 진마 stays home and the
 * 진마-side chariot comes up to rank 2 (최국수포진) or rank 5 (5선 최국수포진 = 김경만포진).
 */
function hanGwimaDetails(result: SideOpening, startFen: string, pieces: Tracked[]) {
  // the reference diagrams have 한's 귀마 on the board's left (c10 → d8); mirror the files otherwise
  const gwimaLeft = parsePieces(startFen).get('c10')?.toLowerCase() === 'n'
  const FILES = 'abcdefghi'
  const f = (file: string) => (gwimaLeft ? file : FILES[8 - FILES.indexOf(file)])
  const han = pieces.filter((p) => p.side === 'han')

  // judged on the position, not the move order (transpositions get the same name, as on chess.com):
  // where the defining pawn stands now
  const pawnRules: [NonNullable<SideOpening['pawn']>, string, string][] = [
    ['중앙병좌', 'e7', f('d') + '7'],
    ['좌진병상', f('c') + '7', f('c') + '6'],
    ['좌진병좌', f('c') + '7', f('b') + '7'],
    ['좌진병우', f('c') + '7', f('d') + '7'],
  ]
  for (const [name, home, now] of pawnRules) {
    const pawn = han.find((p) => p.type === 'p' && p.home === home && p.at === now)
    if (pawn) {
      result.pawn = name
      result.keyPlies = [...(result.keyPlies ?? []), pawn.moves[pawn.moves.length - 1].ply]
      break
    }
  }

  // 최국수: 초 has a cannon on its 면, 한's 진마 is still home and the 진마-side chariot stands on rank 2 (or 5)
  const choFace = pieces.some((p) => p.side === 'cho' && p.type === 'c' && p.at === 'e3')
  const jinmaHome = han.some((p) => p.type === 'n' && p.home === f('h') + '10' && p.at === p.home)
  const chariot = han.find((p) => p.type === 'r' && p.home === f('i') + '10' && p.at)
  if (choFace && jinmaHome && chariot?.at) {
    const relRank = 11 - +chariot.at.slice(1)
    if (relRank === 2) result.chariot = '최국수포진'
    else if (relRank === 5) result.chariot = '김경만포진'
    if (result.chariot) result.keyPlies = [...(result.keyPlies ?? []), chariot.moves[chariot.moves.length - 1].ply]
  }
}

export function classifyOpening(startFen: string, ucis: string[]): Opening {
  const pieces = track(startFen, ucis)
  const cho = classifySide(startFen, 'cho', pieces)
  const han = classifySide(startFen, 'han', pieces)
  if (han.formation === '귀마') hanGwimaDetails(han, startFen, pieces)

  let matchup: Opening['matchup']
  if (cho.formation === '귀마' && han.formation === '귀마') {
    // 맞상: outer elephants on opposite board sides, so the 귀윗상 (d4 vs f7, or f4 vs d7) attack each other
    const start = parsePieces(startFen)
    const outerElephant = (side: Side) => (start.get(sq('b', side, 1))?.toLowerCase() === 'b' ? 'b' : 'h')
    matchup = outerElephant('cho') === outerElephant('han') ? '엇상' : '맞상'
  }

  let named: Opening['named']
  if (han.chariot === '최국수포진') named = { title: '최국수포진' }
  else if (han.chariot === '김경만포진') named = { title: '5선 최국수포진 (김경만포진)' }
  else if (cho.formation === '원앙마' && han.formation === '귀마' && isBasic16(pieces)) named = { title: '16번 기본수' }

  const parts: string[] = []
  if (matchup) parts.push(matchup)
  // 한 (후수) gets the full name, e.g. "변형 좌진병우포진"; 초 just 정형/변형
  const hanName = han.cannon && han.pawn ? `${han.cannon.slice(0, 2)} ${han.pawn}포진` : han.cannon
  if (named) parts.push(named.title)
  else if (hanName) parts.push(`한 ${hanName}`)
  if (cho.cannon) parts.push(`초 ${cho.cannon}`)
  const name = `${cho.formation} 대 ${han.formation}` + (parts.length ? `: ${parts.join(' · ')}` : '')
  return { name, cho, han, matchup, named, book: bookPlies(pieces, [cho, han]) }
}

/**
 * Moves that build a formation: a horse's first move to 귀/진마 squares or the centre, an elephant's first move to
 * 면·귀·귀윗상·중앙상, a cannon's first move to 면, plus the pawn and chariot moves that name 한's variation.
 */
function bookPlies(pieces: Tracked[], sides: SideOpening[]) {
  const book = new Set<number>()
  const targets: Record<string, string[]> = {
    n: ['d3', 'f3', 'c3', 'g3', 'e4'],
    b: ['e3', 'd3', 'f3', 'd4', 'f4', 'e4'],
    c: ['e3'],
  }
  for (const p of pieces) {
    const first = p.moves[0]
    const squares = targets[p.type]
    if (!first || !squares) continue
    if (squares.some((t) => sq(t[0], p.side, +t.slice(1)) === first.to)) book.add(first.ply)
  }
  for (const s of sides) for (const ply of s.keyPlies ?? []) book.add(ply)
  return book
}

/**
 * 16번 기본수 (우창균 기사 방송에서 붙은 이름): 선수 원앙마가 후수 귀마를 상대로 면포를 앞으로 넘겨
 * 포장을 부르고, 농포전으로 차를 잡는 흐름. We look for: a 초 cannon that sat on 면 crosses into 한's half,
 * and a 초 cannon takes a 한 chariot within the opening.
 */
function isBasic16(pieces: Tracked[]) {
  const choCannons = pieces.filter((p) => p.side === 'cho' && p.type === 'c')
  const crossed = choCannons.some((c) => {
    const onFace = c.moves.findIndex((m) => m.to === 'e3')
    return onFace >= 0 && c.moves.slice(onFace + 1).some((m) => +m.to.slice(1) >= 6)
  })
  const tookChariot = choCannons.some((c) => c.moves.some((m) => m.capture === 'rH'))
  return crossed && tookChariot
}

