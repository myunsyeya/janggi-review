// Client side of studies: the compiled JSON (public/studies, built from content/studies) and a flat node table
// with positions for the viewer.
import { startFen, withBoard } from './janggi'
import type { Shape, StudyChapter, StudyNode } from './studyFormat'

export interface StudyMeta {
  id: string
  title: string
  topics: string[]
  description: string
  author?: string
  created: string
  updated: string
  chapters: { id: string; name: string; topics?: string[] }[]
}
export interface Study extends Omit<StudyMeta, 'chapters'> {
  chapters: StudyChapter[]
}

export interface ViewNode {
  id: number
  parent: number | null
  uci: string
  san: string
  fen: string
  ply: number
  comment?: string
  glyphs?: string[]
  shapes?: Shape[]
  children: number[]
}

let indexPromise: Promise<StudyMeta[]> | null = null
export const loadStudyIndex = () =>
  (indexPromise ??= fetch('/studies/index.json').then((r) => (r.ok ? r.json() : [])))

const studies = new Map<string, Promise<Study | null>>()
export function loadStudy(id: string) {
  if (!studies.has(id)) studies.set(id, fetch(`/studies/${id}.json`).then((r) => (r.ok ? r.json() : null)))
  return studies.get(id)!
}

/** Flattens a chapter tree, computing every position. Node 0 is the starting position. */
export function chapterNodes(ch: StudyChapter): ViewNode[] {
  const fen0 = startFen(ch.cho, ch.han)
  const nodes: ViewNode[] = [
    { id: 0, parent: null, uci: '', san: '', fen: fen0, ply: 0, comment: ch.root.comment, shapes: ch.root.shapes, children: [] },
  ]
  const add = (src: StudyNode, parent: ViewNode) => {
    const fen = withBoard(parent.fen, (b) => (b.push(src.uci!), b.fen()))
    const n: ViewNode = {
      id: nodes.length,
      parent: parent.id,
      uci: src.uci!,
      san: src.san!,
      fen,
      ply: parent.ply + 1,
      comment: src.comment,
      glyphs: src.glyphs,
      shapes: src.shapes,
      children: [],
    }
    nodes.push(n)
    parent.children.push(n.id)
    for (const c of src.ch) add(c, n)
  }
  for (const c of ch.root.ch) add(c, nodes[0])
  return nodes
}

export const GLYPH_COLOR: Record<string, string> = {
  '!!': '#168226',
  '!': '#22ac38',
  '!?': '#ea45d8',
  '?!': '#56b4e9',
  '?': '#e69f00',
  '??': '#df5353',
}

export const SHAPE_COLOR: Record<Shape['color'], string> = {
  G: '#15781b',
  R: '#882020',
  B: '#003088',
  Y: '#e68f00',
}

/** Where a topic leads within a study: the first chapter tagged with it, or the study itself */
export function topicHref(s: { id: string; chapters: { id: string; topics?: string[] }[] }, topic: string | null) {
  const ch = topic ? s.chapters.find((c) => c.topics?.includes(topic)) : undefined
  return ch ? `/study/${s.id}/${ch.id}` : `/study/${s.id}`
}

/** "3. Hc3" / "3... Hd8" */
export const moveLabel = (n: ViewNode) => `${Math.ceil(n.ply / 2)}${n.ply % 2 ? '.' : '...'} ${n.san}`

export function timeAgo(date: string) {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000)
  if (days < 1) return '오늘'
  if (days < 30) return `${days}일 전`
  if (days < 365) return `${Math.floor(days / 30)}달 전`
  return `${Math.floor(days / 365)}년 전`
}
