// Client side of studies: the compiled JSON (public/studies, built from content/studies) and a flat node table
// with positions for the viewer.
import { sanOf, startFen, withBoard } from './janggi'
import { savedToken } from './net'
import type { Shape, StudyChapter, StudyNode } from './studyFormat'

export interface StudyMeta {
  id: string
  title: string
  topics: string[]
  description: string
  author?: string
  /** written by a user on the site (id starts with "u-"), not an official research note */
  user?: boolean
  created: string
  updated: string
  chapters: { id: string; name: string; topics?: string[] }[]
}
export interface Study extends Omit<StudyMeta, 'chapters'> {
  chapters: StudyChapter[]
  // user studies only
  published?: boolean
  hidden?: boolean
  reports?: number
  likes?: number
  owner?: boolean
  admin?: boolean
  /** the chapters' source text, for the owner's editor */
  pgn?: { id: string; pgn: string }[]
}

export const isUserStudy = (id: string) => id.startsWith('u-')

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
  /** a move only mentioned in a comment: reachable by clicking it there, not drawn in the tree */
  hidden?: boolean
  /** moves written in the comment text that can be clicked: text range -> node */
  links?: { start: number; end: number; target: number }[]
}

let indexPromise: Promise<StudyMeta[]> | null = null
/** The official studies (built into the site) */
export const loadOfficialIndex = () =>
  (indexPromise ??= fetch('/studies/index.json').then((r) => (r.ok ? r.json() : [])))

const authHeaders = (): Record<string, string> => {
  const t = savedToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

/** Official studies and the published user studies (fetched fresh each time) */
export async function loadStudyIndex(): Promise<StudyMeta[]> {
  const [official, users] = await Promise.all([
    loadOfficialIndex(),
    fetch('/api/user-studies').then((r) => (r.ok ? r.json() : []), () => []),
  ])
  return [...official, ...users]
}

/** My own user studies, drafts included */
export const loadMyStudies = (): Promise<StudyMeta[]> =>
  fetch('/api/user-studies/mine', { headers: authHeaders() }).then((r) => (r.ok ? r.json() : []), () => [])

const studies = new Map<string, Promise<Study | null>>()
export function loadStudy(id: string): Promise<Study | null> {
  if (isUserStudy(id)) return fetch(`/api/user-studies/${id}`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : null), () => null)
  if (!studies.has(id)) studies.set(id, fetch(`/studies/${id}.json`).then((r) => (r.ok ? r.json() : null)))
  return studies.get(id)!
}

/** Names and theory positions from well-liked user studies (see server/userStudies.ts) */
let extraPromise: Promise<{ names: PositionNames; theory: string[] }> | null = null
const loadExtra = () =>
  (extraPromise ??= fetch('/api/study-extra').then((r) => (r.ok ? r.json() : { names: {}, theory: [] }), () => ({ names: {}, theory: [] })))

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
  for (const n of [...nodes]) if (n.comment) n.links = commentLinks(nodes, n)
  return nodes
}

// "2...Hd8 3. Hg3 Hg8 4. Ee4" in a comment: a move number, then moves in this site's notation
const SAN = String.raw`(?:pass|[KAEHCR][a-i]?(?:10|[1-9])?x?[a-i](?:10|[1-9])|[a-i](?:10|[1-9])?x?[a-i](?:10|[1-9])|[a-i](?:10|[1-9]))[+#]?`
const SEQ = new RegExp(String.raw`(\d+)\.(\.\.)?\s?(${SAN}(?:\s+(?:\d+\.(?:\.\.)?\s?)?${SAN})*)`, 'g')
const TOKEN = new RegExp(String.raw`(?:\d+\.(?:\.\.)?\s?)?(${SAN})`, 'g')

/**
 * Finds move sequences written in a node's comment and turns them into clickable links. The first move's number says
 * where the sequence starts: from the line leading to this node, or continuing down its main line. Moves already in the
 * tree are reused; others become hidden nodes. Anything that is not legal there stays plain text.
 */
function commentLinks(nodes: ViewNode[], n: ViewNode) {
  const path: ViewNode[] = []
  for (let a: ViewNode | undefined = n; a; a = a.parent === null ? undefined : nodes[a.parent]) path.unshift(a)
  const links: { start: number; end: number; target: number }[] = []
  for (const m of n.comment!.matchAll(SEQ)) {
    const ply = (+m[1] - 1) * 2 + (m[2] ? 2 : 1)
    let base: ViewNode | undefined = path[ply - 1]
    if (!base) {
      base = n
      while (base && base.ply < ply - 1) base = base.children.length ? nodes[base.children[0]] : undefined
    }
    if (!base || base.ply !== ply - 1) continue
    const seqStart = m.index! + m[0].length - m[3].length
    for (const t of m[3].matchAll(TOKEN)) {
      const word = t[1].replace(/[+#]/g, '')
      const from: ViewNode = base
      const uci: string | undefined = withBoard(from.fen, (b) => {
        const legal = b.legalMoves().split(' ').filter(Boolean)
        return legal.find((u) => sanOf(b, u, legal).replace(/[+#]/g, '') === word)
      })
      if (!uci) break
      let next: ViewNode | undefined = base.children.map((c) => nodes[c]).find((c) => c.uci === uci)
      if (!next) {
        const fen: string = withBoard(from.fen, (b) => (b.push(uci), b.fen()))
        const san: string = withBoard(from.fen, (b) => sanOf(b, uci))
        next = { id: nodes.length, parent: base.id, uci, san, fen, ply: base.ply + 1, children: [], hidden: true }
        nodes.push(next)
        base.children.push(next.id)
      }
      const at = seqStart + t.index! + t[0].length - t[1].length
      links.push({ start: at, end: at + t[1].length, target: next.id })
      base = next
    }
  }
  return links.length ? links : undefined
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

type StudyRef = { id: string; chapters: { id: string; topics?: string[] }[] }

/** A chapter's address. The first chapter is the study's own address. */
export const chapterHref = (s: StudyRef, chapterId: string) =>
  s.chapters[0]?.id === chapterId ? `/study/${s.id}` : `/study/${s.id}/${chapterId}`

/** Where a topic leads within a study: the first chapter tagged with it, or the study itself */
export function topicHref(s: StudyRef, topic: string | null) {
  const ch = topic ? s.chapters.find((c) => c.topics?.includes(topic)) : undefined
  return ch ? chapterHref(s, ch.id) : `/study/${s.id}`
}

/** topic name -> English path segment (/study/topic/<slug>) */
let topicsPromise: Promise<Record<string, string>> | null = null
export const loadTopics = () => (topicsPromise ??= fetch('/studies/topics.json').then((r) => (r.ok ? r.json() : {})))
export const topicPath = (slugs: Record<string, string>, topic: string) => `/study/topic/${slugs[topic] ?? encodeURIComponent(topic)}`

/** "3. Hc3" / "3... Hd8" */
export const moveLabel = (n: ViewNode) => `${Math.ceil(n.ply / 2)}${n.ply % 2 ? '.' : '...'} ${n.san}`

export function timeAgo(date: string) {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000)
  if (days < 1) return '오늘'
  if (days < 30) return `${days}일 전`
  if (days < 365) return `${Math.floor(days / 30)}달 전`
  return `${Math.floor(days / 365)}년 전`
}

/** Position key for theory lookups: board and side to move (transpositions count as the same position) */
export const positionKey = (fen: string) => fen.split(' ').slice(0, 2).join(' ')

let theoryPromise: Promise<Set<string>> | null = null
/**
 * Every position reached in a study (main lines and variations) is theory, like an opening book. Not counted:
 * moves marked ?, ?! or ?? and everything after them, and moves only mentioned in comments. Needs the rules loaded.
 */
export function loadTheory() {
  return (theoryPromise ??= loadOfficialIndex().then(async (index) => {
    const keys = new Set<string>((await loadExtra()).theory)
    for (const meta of index) {
      const study = await loadStudy(meta.id)
      for (const ch of study?.chapters ?? []) {
        const nodes = chapterNodes(ch)
        const visit = (id: number) => {
          for (const c of nodes[id].children) {
            const n = nodes[c]
            if (n.hidden || n.glyphs?.some((g) => g.includes('?'))) continue
            keys.add(positionKey(n.fen))
            visit(c)
          }
        }
        visit(0)
      }
    }
    return keys
  }))
}

export type PositionNames = Record<string, { name: string; study: string; chapter: string; path: string; moves?: string[] }>
let namesPromise: Promise<PositionNames> | null = null
/** Names that studies gave to positions ([%name …] in a chapter), keyed by positionKey */
export const loadNames = () =>
  (namesPromise ??= Promise.all([fetch('/studies/names.json').then((r) => (r.ok ? r.json() : {})), loadExtra()]).then(
    ([official, extra]) => ({ ...extra.names, ...official }), // an official name wins
  ))

/** In-app navigation from code (the app follows popstate) */
export function navigate(to: string) {
  history.pushState(null, '', to)
  dispatchEvent(new PopStateEvent('popstate'))
}
