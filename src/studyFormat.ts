// Study chapter format: PGN-style movetext in this site's notation, as on lichess studies.
//
//   [Chapter "귀마 대 귀마: 첫 수"]
//   [Cho "상마상마"]
//   [Han "마상마상"]
//   { comment on the starting position }
//   1. ab4 { comment [%cal Ga4b4] [%csl Gb4] } (1. Hc3 { another try }) 1... Hd8 2. Ce3!? …
//
// Moves may be written in SAN (as shown on the site) or as coordinates (c10d8). Glyphs: ! ? !! ?? !? ?!
// Shapes inside comments: [%cal Ga1a3,Rb1c3] arrows, [%csl Ge4,Rd5] circles (G green, R red, B blue, Y yellow).
import { SETUPS, isPass, sanOf, startFen, withBoard, type Setup } from './janggi.ts'

export interface Shape {
  from: string
  to: string // same as from for a circle
  color: 'G' | 'R' | 'B' | 'Y'
}

export interface StudyNode {
  uci?: string
  san?: string
  comment?: string
  glyphs?: string[]
  shapes?: Shape[]
  ch: StudyNode[]
}

export interface StudyChapter {
  id: string
  name: string
  cho: Setup
  han: Setup
  root: StudyNode
}

const GLYPHS = ['!!', '??', '!?', '?!', '!', '?']
const SQ = '[a-i](?:10|[1-9])'

function takeShapes(text: string) {
  const shapes: Shape[] = []
  const rest = text.replace(/\[%(cal|csl)\s+([^\]]*)\]/g, (_, kind: string, list: string) => {
    for (const item of list.split(',').map((x) => x.trim()).filter(Boolean)) {
      const m = new RegExp(`^([GRBY])(${SQ})(${SQ})?$`).exec(item)
      if (!m) throw new Error(`bad shape "${item}"`)
      shapes.push({ color: m[1] as Shape['color'], from: m[2], to: kind === 'cal' ? (m[3] ?? m[2]) : m[2] })
    }
    return ''
  })
  return { shapes, comment: rest.replace(/[ \t]+\n/g, '\n').trim() }
}

function tokenize(movetext: string) {
  const tokens: string[] = []
  const re = /\{[^}]*\}|\(|\)|\$\d+|[^\s(){}]+/g
  for (const m of movetext.matchAll(re)) tokens.push(m[0])
  return tokens
}

/** Parses one chapter file. Every move is checked against the rules; errors say where. */
export function parseChapter(source: string, id: string): StudyChapter {
  const tag = (name: string) => new RegExp(`^\\[${name}\\s+"([^"]*)"\\]`, 'm').exec(source)?.[1]
  const setup = (v: string | undefined, who: string): Setup => {
    if (!v || !(SETUPS as readonly string[]).includes(v)) throw new Error(`${id}: [${who}] must be one of ${SETUPS.join(', ')}`)
    return v as Setup
  }
  const cho = setup(tag('Cho'), 'Cho')
  const han = setup(tag('Han'), 'Han')
  // headers are the [Tag "value"] lines at the top; everything after them is movetext
  const lines = source.split('\n')
  let first = 0
  while (first < lines.length && (/^\s*$/.test(lines[first]) || /^\[\w+\s+"[^"]*"\]\s*$/.test(lines[first]))) first++
  const movetext = lines.slice(first).join('\n')
  const fen0 = startFen(cho, han)

  const root: StudyNode = { ch: [] }
  // stack of (node to attach the next move to, position fen, node the last move was attached to)
  type Frame = { parent: StudyNode; fen: string; last: StudyNode; lastParent: StudyNode; lastFen: string }
  let cur: Frame = { parent: root, fen: fen0, last: root, lastParent: root, lastFen: fen0 }
  const stack: Frame[] = []

  for (const tok of tokenize(movetext)) {
    if (tok.startsWith('{')) {
      const { shapes, comment } = takeShapes(tok.slice(1, -1))
      const n = cur.last
      if (comment) n.comment = n.comment ? `${n.comment}\n\n${comment}` : comment
      if (shapes.length) n.shapes = [...(n.shapes ?? []), ...shapes]
    } else if (tok === '(') {
      // a variation replaces the last move: continue from the position before it
      stack.push(cur)
      cur = { parent: cur.lastParent, fen: cur.lastFen, last: cur.last, lastParent: cur.lastParent, lastFen: cur.lastFen }
    } else if (tok === ')') {
      const back = stack.pop()
      if (!back) throw new Error(`${id}: unbalanced ")"`)
      cur = back
    } else if (/^\d+\.+$/.test(tok) || tok === '*' || /^\$\d+$/.test(tok)) {
      continue
    } else {
      // a move, maybe with a move number glued on ("1.ab4") and glyphs ("Ce3!?")
      let word = tok.replace(/^\d+\.+/, '')
      const glyph = GLYPHS.find((g) => word.endsWith(g) && word.length > g.length)
      if (glyph) word = word.slice(0, -glyph.length)
      const { uci, san, fen } = withBoard(cur.fen, (b) => {
        const legal = b.legalMoves().split(' ').filter(Boolean)
        const clean = (s: string) => s.replace(/[+#]/g, '')
        const found =
          legal.find((u) => u === word) ?? legal.find((u) => clean(sanOf(b, u, legal)) === clean(word)) ?? (word === 'pass' ? legal.find(isPass) : undefined)
        if (!found) throw new Error(`${id}: illegal or unknown move "${tok}" (position ${cur.fen})`)
        const s = sanOf(b, found, legal)
        b.push(found)
        return { uci: found, san: s, fen: b.fen() }
      })
      const node: StudyNode = { uci, san, ch: [] }
      if (glyph) node.glyphs = [glyph]
      cur.parent.ch.push(node)
      cur = { parent: node, fen, last: node, lastParent: cur.parent, lastFen: cur.fen }
    }
  }
  if (stack.length) throw new Error(`${id}: unclosed "("`)
  return { id, name: tag('Chapter') ?? id, cho, han, root }
}

/** Main line plus all variations, in order, for plain-text rendering (SEO) */
export function walk(node: StudyNode, visit: (n: StudyNode, depth: number) => void, depth = 0) {
  node.ch.forEach((c, i) => {
    visit(c, depth + (i > 0 ? 1 : 0))
    walk(c, visit, depth + (i > 0 ? 1 : 0))
  })
}

