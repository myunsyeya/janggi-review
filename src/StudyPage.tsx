// A study, laid out like a lichess study: chapters | board (+ title, likes, topics) | annotated move tree.
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Board, { type Arrow } from './Board'
import { OpeningBar } from './OpeningBar'
import { classifyOpening } from './openings'
import { api, savedToken } from './net'
import { isPass, parsePieces, parseUci, withBoard } from './janggi'
import { moveSound, playSound } from './sound'
import { GLYPH_COLOR, SHAPE_COLOR, chapterNodes, loadStudy, moveLabel, topicHref, type Study, type ViewNode } from './studyData'
import { IconFirst, IconLast, IconNext, IconPrev, useHeldKey } from './ui'

export default function StudyPage({
  id,
  chapterId,
  active,
  rulesReady,
}: {
  id: string
  chapterId: string | null
  active: boolean
  rulesReady: boolean
}) {
  const [study, setStudy] = useState<Study | null | undefined>(undefined)
  const [cur, setCur] = useState(0)
  const [baseFlipped, setFlipped] = useState(false)
  const flipped = baseFlipped !== useHeldKey('KeyF', active)
  const [like, setLike] = useState<{ n: number; mine: boolean } | null>(null)

  useEffect(() => {
    setStudy(undefined)
    loadStudy(id).then(setStudy)
  }, [id])
  useEffect(() => {
    if (!active) return
    api<{ likes: Record<string, number>; mine: string[] }>(`/study-likes?ids=${id}`, savedToken()).then(
      (r) => setLike({ n: r.likes[id] ?? 0, mine: r.mine.includes(id) }),
      () => {},
    )
  }, [id, active])

  const chapter = study ? (study.chapters.find((c) => c.id === chapterId) ?? study.chapters[0]) : null
  const nodes = useMemo(() => (chapter && rulesReady ? chapterNodes(chapter) : []), [chapter, rulesReady])
  useEffect(() => {
    setCur(0)
    lastSoundAt.current = 0
  }, [chapter])
  useEffect(() => {
    if (study && chapter) document.title = `${study.title}: ${chapter.name} | 초한 장기`
  }, [study, chapter])

  const node = nodes[cur]

  // stepping one move forward plays that move's sound, as on the analysis board
  const lastSoundAt = useRef(0)
  useEffect(() => {
    const from = lastSoundAt.current
    lastSoundAt.current = cur
    const n = nodes[cur]
    if (!active || !n || n.parent !== from || n.parent === null) return
    const capture = !isPass(n.uci) && parsePieces(nodes[from].fen).has(parseUci(n.uci).to)
    playSound(moveSound({ capture, check: withBoard(n.fen, (b) => b.isCheck()), over: false }))
  }, [cur]) // eslint-disable-line react-hooks/exhaustive-deps
  const go = (to: number | undefined) => to !== undefined && nodes[to] && setCur(to)
  const lineEnd = (from: number) => {
    let n = nodes[from]
    while (n.children.length) n = nodes[n.children[0]]
    return n.id
  }

  useEffect(() => {
    if (!active || !node) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'ArrowLeft') go(node.parent ?? undefined)
      else if (e.key === 'ArrowRight') go(node.children[0])
      else if (e.key === 'ArrowUp' || e.key === 'Home') go(0)
      else if (e.key === 'ArrowDown' || e.key === 'End') go(lineEnd(node.id))
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const opening = useMemo(() => {
    if (!node || !chapter || !node.ply) return null
    const line: string[] = []
    for (let n: ViewNode | undefined = node; n && n.parent !== null; n = nodes[n.parent]) line.unshift(n.uci)
    return classifyOpening(nodes[0].fen, line)
  }, [node, chapter, nodes])

  if (study === null) return <div className="studies muted pad">연구를 찾을 수 없어요.</div>
  if (!study || !chapter || !node) return <div className="studies muted pad">불러오는 중…</div>

  const arrows: Arrow[] = (node.shapes ?? []).map((s) => ({ from: s.from, to: s.to, color: SHAPE_COLOR[s.color] }))

  const toggleLike = async () => {
    try {
      const r = await api<{ liked: boolean; likes: number }>(`/study-likes/${id}`, savedToken(), {})
      setLike({ n: r.likes, mine: r.liked })
    } catch (e) {
      alert((e as Error).message)
    }
  }

  return (
    <div className="study">
      <aside className="study-chapters">
        <div className="study-chapters-head">{study.chapters.length} 챕터</div>
        <ol>
          {study.chapters.map((c, i) => (
            <li key={c.id} className={c.id === chapter.id ? 'active' : ''}>
              <a href={`/study/${study.id}/${c.id}`}>
                <span className="ch-no">{i + 1}</span>
                {c.name}
              </a>
            </li>
          ))}
        </ol>
      </aside>

      <section className="study-board">
        <div className="board-wrap study-board-wrap">
          <Board
            fen={node.fen}
            legal={[]}
            flipped={flipped}
            lastMove={node.uci || undefined}
            arrows={arrows}
            interactive={false}
            onMove={() => {}}
          />
        </div>
        <div className="study-title">
          <span>
            {study.title}: {chapter.name}
          </span>
          <button className={`study-like ${like?.mine ? 'on' : ''}`} onClick={toggleLike} title="좋아요">
            {like?.mine ? '♥' : '♡'} {like?.n ?? 0}
          </button>
        </div>
        <div className="study-topics">
          {study.topics.map((t) => (
            <a
              key={t}
              href={study.chapters.some((c) => c.topics?.includes(t)) ? topicHref(study, t) : `/study/topic/${encodeURIComponent(t)}`}
              className={chapter.topics?.includes(t) ? 'on' : ''}>
              {t}
            </a>
          ))}
        </div>
      </section>

      <section className="study-side">
        <OpeningBar opening={opening} />
        <StudyTree nodes={nodes} cur={cur} onSelect={setCur} />
        {node.children.length > 0 && (
          <div className="study-next">
            {node.children.map((c) => (
              <button key={c} onClick={() => setCur(c)} className={c === node.children[0] ? 'main' : ''}>
                {moveLabel(nodes[c])}
                <Glyph g={nodes[c].glyphs} />
              </button>
            ))}
          </div>
        )}
        <footer className="controls study-controls">
          <button title="처음 (↑)" onClick={() => go(0)}>
            <IconFirst />
          </button>
          <button title="이전 (←)" onClick={() => go(node.parent ?? undefined)}>
            <IconPrev />
          </button>
          <button title="다음 (→)" onClick={() => go(node.children[0])}>
            <IconNext />
          </button>
          <button title="끝 (↓)" onClick={() => go(lineEnd(node.id))}>
            <IconLast />
          </button>
          <button title="판 뒤집기 (f를 누르는 동안)" onClick={() => setFlipped((f) => !f)}>
            ⇅
          </button>
        </footer>
      </section>
    </div>
  )
}

function Glyph({ g }: { g?: string[] }) {
  if (!g?.length) return null
  return (
    <span className="glyph" style={{ color: GLYPH_COLOR[g[0]] }}>
      {g.join('')}
    </span>
  )
}

/** lichess-like move tree: main line in two columns, comments as paragraphs, variations indented inline. */
function StudyTree({ nodes, cur, onSelect }: { nodes: ViewNode[]; cur: number; onSelect: (id: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' })
  }, [cur])

  const move = (n: ViewNode, withNumber: boolean) => (
    <span key={'m' + n.id} className={`tv-move ${cur === n.id ? 'active' : ''}`} onClick={() => onSelect(n.id)}>
      {withNumber && <span className="tv-num">{Math.ceil(n.ply / 2) + (n.ply % 2 ? '.' : '...')}</span>}
      {n.san}
      <Glyph g={n.glyphs} />
    </span>
  )

  // a variation, inline: moves, small comments, nested variations in parentheses
  const line = (start: number): ReactNode[] => {
    const out: ReactNode[] = []
    let n: ViewNode | undefined = nodes[start]
    let number = true
    let first = true
    while (n) {
      out.push(move(n, number || n.ply % 2 === 1))
      number = false
      if (n.comment) {
        out.push(
          <span key={'c' + n.id} className="tv-inline-comment">
            {n.comment}
          </span>,
        )
        number = true
      }
      if (!first) {
        for (const alt of nodes[n.parent!].children.slice(1)) {
          out.push(
            <span key={'p' + alt} className="tv-paren">
              ({line(alt)})
            </span>,
          )
          number = true
        }
      }
      first = false
      n = n.children.length ? nodes[n.children[0]] : undefined
    }
    return out
  }

  const items: ReactNode[] = []
  if (nodes[0].comment) items.push(<p key="root" className="tv-comment">{nodes[0].comment}</p>)
  let row: ReactNode[] = []
  let rowNo = 0
  const flush = () => {
    if (!row.length) return
    items.push(
      <div className="tv-row" key={'r' + items.length}>
        <span className="tv-index">{rowNo}</span>
        {row}
      </div>,
    )
    row = []
  }
  for (let n: ViewNode | undefined = nodes[0].children.length ? nodes[nodes[0].children[0]] : undefined; n; ) {
    const cho = n.ply % 2 === 1
    if (cho) {
      flush()
      rowNo = Math.ceil(n.ply / 2)
    } else if (!row.length) {
      rowNo = Math.ceil(n.ply / 2)
      row.push(<span key={'dots' + n.id} className="tv-move tv-dots">…</span>)
    }
    row.push(move(n, false))
    const alts = nodes[n.parent!].children.slice(1)
    if (n.comment || alts.length) {
      if (cho) row.push(<span key={'gap' + n.id} className="tv-move tv-dots">…</span>)
      flush()
      if (n.comment)
        items.push(
          <p key={'c' + n.id} className="tv-comment">
            {n.comment}
          </p>,
        )
      if (alts.length)
        items.push(
          <div key={'v' + n.id} className="tv-variations">
            {alts.map((a) => (
              <div key={a} className="tv-variation">
                {line(a)}
              </div>
            ))}
          </div>,
        )
    } else if (!cho) flush()
    n = n.children.length ? nodes[n.children[0]] : undefined
  }
  flush()

  return (
    <div className="study-tree" ref={ref}>
      {items.map((x, i) => (
        <Fragment key={i}>{x}</Fragment>
      ))}
    </div>
  )
}
