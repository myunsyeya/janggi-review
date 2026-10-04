// The study editor's model: a chapter is an analysis-board move tree plus notes per move (comment, glyph, drawings,
// position name). It is saved as the same PGN-style text as the official studies (see studyFormat.ts), so the
// server checks it with the same parser.
import { startFen, withBoard, type Setup } from './janggi.ts'
import { GAME_TAGS, type GameInfo, type Shape, type StudyChapter, type StudyNode } from './studyFormat.ts'
import { addMove, newTree, ROOT, type Tree } from './tree.ts'

export interface Note {
  comment?: string
  glyph?: string
  shapes?: Shape[]
  name?: string
}

export interface EditChapter {
  id?: string // kept by the server once saved
  name: string
  cho: Setup
  han: Setup
  topics?: string[]
  game?: GameInfo
  tree: Tree
  notes: Record<number, Note>
}

export const GLYPH_CHOICES = ['!!', '!', '!?', '?!', '?', '??'] as const

export function blankChapter(name: string, cho: Setup, han: Setup): EditChapter {
  return { name, cho, han, tree: newTree(startFen(cho, han)), notes: {} }
}

/** A parsed chapter (from the server) as an editable tree */
export function fromChapter(ch: StudyChapter): EditChapter {
  let tree = newTree(startFen(ch.cho, ch.han))
  const notes: Record<number, Note> = {}
  const note = (n: StudyNode): Note | undefined =>
    n.comment || n.glyphs?.length || n.shapes?.length || n.name
      ? { comment: n.comment, glyph: n.glyphs?.[0], shapes: n.shapes, name: n.name }
      : undefined
  const root = note(ch.root)
  if (root) notes[ROOT] = root
  const add = (src: StudyNode, parent: number) => {
    const fen = withBoard(tree.nodes[parent].fen, (b) => (b.push(src.uci!), b.fen()))
    let id: number
    ;[tree, id] = addMove(tree, parent, src.uci!, src.san!, fen)
    const n = note(src)
    if (n) notes[id] = n
    for (const c of src.ch) add(c, id)
  }
  for (const c of ch.root.ch) add(c, ROOT)
  return { id: ch.id, name: ch.name, cho: ch.cho, han: ch.han, topics: ch.topics, game: ch.game, tree, notes }
}

const clean = (s: string) => s.replace(/[{}]/g, '').replace(/\[%/g, '[ %').trim()
const quote = (s: string) => s.replace(/"/g, "'")

function noteText(n: Note | undefined) {
  if (!n) return ''
  const parts: string[] = []
  if (n.comment?.trim()) parts.push(clean(n.comment))
  const arrows = (n.shapes ?? []).filter((s) => s.from !== s.to)
  const circles = (n.shapes ?? []).filter((s) => s.from === s.to)
  if (arrows.length) parts.push(`[%cal ${arrows.map((s) => s.color + s.from + s.to).join(',')}]`)
  if (circles.length) parts.push(`[%csl ${circles.map((s) => s.color + s.from).join(',')}]`)
  if (n.name?.trim()) parts.push(`[%name ${clean(n.name).replace(/\]/g, '')}]`)
  return parts.length ? `{ ${parts.join(' ')} }` : ''
}

/** The chapter as study text: headers, the opening comment, then moves with comments and variations */
export function toPgn(ch: EditChapter): string {
  const { tree, notes } = ch
  const move = (id: number, withNumber: boolean) => {
    const n = tree.nodes[id]
    const no = Math.ceil(n.ply / 2)
    const prefix = n.ply % 2 ? `${no}. ` : withNumber ? `${no}... ` : ''
    const glyph = notes[id]?.glyph ?? ''
    const text = noteText(notes[id])
    return `${prefix}${n.san}${glyph}${text ? ' ' + text : ''}`
  }
  // the moves after `parent`; alternatives follow the move they replace, in parentheses
  const seq = (parent: number, withNumber: boolean): string => {
    const parts: string[] = []
    let p = parent
    let need = withNumber
    while (tree.nodes[p].children.length) {
      const [main, ...alts] = tree.nodes[p].children
      parts.push(move(main, need))
      need = !!noteText(notes[main])
      for (const alt of alts) {
        const rest = seq(alt, !!noteText(notes[alt]))
        parts.push(`(${move(alt, true)}${rest ? ' ' + rest : ''})`)
        need = true
      }
      p = main
    }
    return parts.join(' ')
  }
  const head = [`[Chapter "${quote(ch.name || '챕터')}"]`, `[Cho "${ch.cho}"]`, `[Han "${ch.han}"]`]
  if (ch.topics?.length) head.push(`[Topics "${quote(ch.topics.join(', '))}"]`)
  for (const [key, tag] of GAME_TAGS) {
    const v = ch.game?.[key]?.replace(/[\n\]]/g, ' ').trim()
    if (v) head.push(`[${tag} "${quote(v)}"]`)
  }
  const intro = noteText(notes[ROOT])
  return `${head.join('\n')}\n\n${intro ? intro + '\n' : ''}${seq(ROOT, true)} *\n`
}

// board drawing colors <-> study shape letters
const COLOR_LETTER: Record<string, Shape['color']> = {
  'var(--draw-green)': 'G',
  'var(--draw-red)': 'R',
  'var(--draw-blue)': 'B',
  'var(--draw-orange)': 'Y',
}
const LETTER_COLOR: Record<Shape['color'], string> = { G: 'var(--draw-green)', R: 'var(--draw-red)', B: 'var(--draw-blue)', Y: 'var(--draw-orange)' }
export const toShapes = (arrows: { from: string; to: string; color: string }[]): Shape[] =>
  arrows.map((a) => ({ from: a.from, to: a.to, color: COLOR_LETTER[a.color] ?? 'G' }))
export const toArrows = (shapes: Shape[] = []) => shapes.map((s) => ({ from: s.from, to: s.to, color: LETTER_COLOR[s.color] }))
