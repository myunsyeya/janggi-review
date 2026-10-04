// A study, laid out like a lichess study: chapters | board (+ title, likes, topics) | annotated move tree.
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Board, { type Arrow } from './Board'
import { OpeningBar } from './OpeningBar'
import { useOpening } from './openingNames'
import { api, savedToken } from './net'
import { isPass, parsePieces, parseUci, withBoard } from './janggi'
import type { GameInfo } from './studyFormat'
import { moveSound, playSound } from './sound'
import { GLYPH_COLOR, SHAPE_COLOR, navigate, chapterHref, chapterNodes, loadStudy, loadTopics, moveLabel, topicHref, topicPath, type Study, type ViewNode } from './studyData'
import { IconFirst, IconLast, IconNext, IconPrev, useHeldKey } from './ui'

export default function StudyPage({
  id,
  chapterId,
  at,
  active,
  rulesReady,
}: {
  id: string
  chapterId: string | null
  /** moves (uci, comma-separated) leading to the position to open, e.g. from an opening name's link */
  at?: string | null
  active: boolean
  rulesReady: boolean
}) {
  const [study, setStudy] = useState<Study | null | undefined>(undefined)
  const [cur, setCur] = useState(0)
  const [baseFlipped, setFlipped] = useState(false)
  const [chaptersOpen, setChaptersOpen] = useState(false)
  useEffect(() => setChaptersOpen(false), [id, chapterId])
  const flipped = baseFlipped !== useHeldKey('KeyF', active)
  const [like, setLike] = useState<{ n: number; mine: boolean } | null>(null)

  const [slugs, setSlugs] = useState<Record<string, string>>({})
  useEffect(() => {
    setStudy(undefined)
    loadStudy(id).then(setStudy)
    loadTopics().then(setSlugs)
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
  // open at the start, or at the position given by ?moves= when the chapter has it
  useEffect(() => {
    let target = 0
    for (const uci of at?.split(',').filter(Boolean) ?? []) {
      const next = nodes[target]?.children.find((c) => nodes[c].uci === uci)
      if (next === undefined) {
        target = 0
        break
      }
      target = next
    }
    setCur(target)
    lastSoundAt.current = target
  }, [nodes, at])
  useEffect(() => {
    if (study && chapter) document.title = `${study.title}: ${chapter.name} | 초한 장기`
  }, [study, chapter])

  const node = nodes[cur]
  // moves only mentioned in comments are hidden: they are not offered as next moves, except to continue such a line
  const next = (n: ViewNode) => (n.hidden ? n.children : n.children.filter((c) => !nodes[c].hidden))

  // moving forward along the line (one move or a jump ahead) plays the sound of the move arrived at; going back is silent
  const lastSoundAt = useRef(0)
  useEffect(() => {
    const from = lastSoundAt.current
    lastSoundAt.current = cur
    const n = nodes[cur]
    if (!active || !n || n.parent === null || cur === from) return
    let a: ViewNode | undefined = n
    while (a && a.id !== from) a = a.parent === null ? undefined : nodes[a.parent]
    if (!a) return
    const capture = !isPass(n.uci) && parsePieces(nodes[n.parent].fen).has(parseUci(n.uci).to)
    playSound(moveSound({ capture, check: withBoard(n.fen, (b) => b.isCheck()), over: false }))
  }, [cur]) // eslint-disable-line react-hooks/exhaustive-deps
  const go = (to: number | undefined) => to !== undefined && nodes[to] && setCur(to)
  const lineEnd = (from: number) => {
    let n = nodes[from]
    while (next(n).length) n = nodes[next(n)[0]]
    return n.id
  }

  useEffect(() => {
    if (!active || !node) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'ArrowLeft') go(node.parent ?? undefined)
      else if (e.key === 'ArrowRight') go(next(node)[0])
      else if (e.key === 'ArrowUp' || e.key === 'Home') go(0)
      else if (e.key === 'ArrowDown' || e.key === 'End') go(lineEnd(node.id))
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const openingLine = useMemo(() => {
    const line: string[] = []
    for (let n: ViewNode | undefined = node; n && n.parent !== null; n = nodes[n.parent]) line.unshift(n.uci)
    return line
  }, [node, nodes])
  const opening = useOpening(nodes[0]?.fen ?? '', openingLine, rulesReady && !!nodes.length)

  if (study === null) return <div className="studies muted pad">연구를 찾을 수 없어요.</div>
  if (!study || !chapter || !node) return <div className="studies muted pad">불러오는 중…</div>

  const arrows: Arrow[] = (node.shapes ?? []).map((s) => ({ from: s.from, to: s.to, color: SHAPE_COLOR[s.color] }))

  const report = async () => {
    const reason = prompt('신고 사유를 적어 주세요 (스팸, 욕설 등)')
    if (reason === null) return
    try {
      await api(`/user-studies/${id}/report`, savedToken(), { reason })
      alert('신고했어요. 고마워요.')
    } catch (e) {
      alert((e as Error).message)
    }
  }
  const adminHide = async () => {
    try {
      await api(`/user-studies/${id}/hide`, savedToken(), { hidden: !study.hidden })
      location.reload()
    } catch (e) {
      alert((e as Error).message)
    }
  }
  const adminDelete = async () => {
    if (!confirm('이 연구를 지울까요?')) return
    try {
      await api(`/user-studies/${id}/delete`, savedToken(), {})
      navigate('/study')
    } catch (e) {
      alert((e as Error).message)
    }
  }

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
      <aside className={`study-chapters ${chaptersOpen ? 'open' : ''}`}>
        {/* on a phone the list folds to the current chapter; the head opens it */}
        <button className="study-chapters-head" onClick={() => setChaptersOpen((o) => !o)}>
          <span className="ch-wide">{study.chapters.length} 챕터</span>
          <span className="ch-narrow">
            챕터 {study.chapters.indexOf(chapter) + 1} / {study.chapters.length} {chaptersOpen ? '▴' : '▾'}
          </span>
        </button>
        <ol>
          {study.chapters.map((c, i) => (
            <li key={c.id} className={c.id === chapter.id ? 'active' : ''}>
              <a href={chapterHref(study, c.id)}>
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
          <a className="study-notation" href="/notation" title="Hd3, ef4+ 같은 기보 읽는 법">
            표기법
          </a>
          <button className={`study-like ${like?.mine ? 'on' : ''}`} onClick={toggleLike} title="좋아요">
            {like?.mine ? '♥' : '♡'} {like?.n ?? 0}
          </button>
        </div>
        {study.user && (
          <div className="study-byline">
            <span>
              {study.author} · 사용자 연구
              {study.owner && !study.published && ' · 비공개 초안 (나만 보여요)'}
              {study.hidden && ' · 운영자가 숨긴 연구'}
              {(study.owner || study.admin) && !!study.reports && ` · 신고 ${study.reports}건`}
            </span>
            {study.owner && <a href={`/study/${study.id}/edit`}>편집</a>}
            {!study.owner && <button onClick={report}>신고</button>}
            {study.admin && <button onClick={adminHide}>{study.hidden ? '숨김 풀기' : '숨기기'}</button>}
            {study.admin && <button onClick={adminDelete}>지우기</button>}
          </div>
        )}
        <div className="study-topics">
          {study.topics.map((t) => (
            <a
              key={t}
              href={study.chapters.some((c) => c.topics?.includes(t)) ? topicHref(study, t) : topicPath(slugs, t)}
              className={chapter.topics?.includes(t) ? 'on' : ''}>
              {t}
            </a>
          ))}
        </div>
      </section>

      <section className="study-side">
        {chapter.game && <GameCard game={chapter.game} />}
        <OpeningBar opening={opening} link={opening?.named?.page?.split('?')[0] !== chapterHref(study, chapter.id)} />
        <StudyTree
          nodes={nodes}
          cur={cur}
          onSelect={setCur}
          chapterLink={(n) => (study.chapters[n - 1] && n - 1 !== study.chapters.indexOf(chapter) ? chapterHref(study, study.chapters[n - 1].id) : undefined)}
        />
        {next(node).length > 1 && (
          <div className="study-next">
            {next(node).map((c, i) => (
              <button key={c} onClick={() => setCur(c)} className={i === 0 ? 'main' : ''}>
                <span className="study-next-kind">{i > 0 ? '변화' : onMainLine(nodes, node) ? '주 수순' : '이어서'}</span>
                {moveLabel(nodes[c])}
                <Glyph g={nodes[c].glyphs} />
              </button>
            ))}
          </div>
        )}
        <footer className="controls study-controls">
          <button title="처음 (↑)" disabled={node.parent === null} onClick={() => go(0)}>
            <IconFirst />
          </button>
          <button title="이전 (←)" disabled={node.parent === null} onClick={() => go(node.parent ?? undefined)}>
            <IconPrev />
          </button>
          <button title="다음 (→)" disabled={!next(node).length} onClick={() => go(next(node)[0])}>
            <IconNext />
          </button>
          <button title="이 줄의 끝 (↓)" disabled={!next(node).length} onClick={() => go(lineEnd(node.id))}>
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

/** true if every move up to this node is the first choice of its parent */
function onMainLine(nodes: ViewNode[], n: ViewNode) {
  for (let c = n; c.parent !== null; c = nodes[c.parent]) if (nodes[c.parent].children[0] !== c.id) return false
  return true
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
type ChapterLink = (n: number) => string | undefined

function StudyTree({ nodes, cur, onSelect, chapterLink }: { nodes: ViewNode[]; cur: number; onSelect: (id: number) => void; chapterLink: ChapterLink }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' })
  }, [cur])

  const real = (n: ViewNode) => n.children.filter((c) => !nodes[c].hidden)
  const text = (n: ViewNode) => <CommentText node={n} cur={cur} onSelect={onSelect} chapterLink={chapterLink} />

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
            {text(n)}
          </span>,
        )
        number = true
      }
      if (!first) {
        for (const alt of real(nodes[n.parent!]).slice(1)) {
          out.push(
            <span key={'p' + alt} className="tv-paren">
              ({line(alt)})
            </span>,
          )
          number = true
        }
      }
      first = false
      n = real(n).length ? nodes[real(n)[0]] : undefined
    }
    return out
  }

  const items: ReactNode[] = []
  if (nodes[0].comment)
    items.push(
      <p key="root" className="tv-comment">
        {text(nodes[0])}
      </p>,
    )
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
  for (let n: ViewNode | undefined = real(nodes[0]).length ? nodes[real(nodes[0])[0]] : undefined; n; ) {
    const cho = n.ply % 2 === 1
    if (cho) {
      flush()
      rowNo = Math.ceil(n.ply / 2)
    } else if (!row.length) {
      rowNo = Math.ceil(n.ply / 2)
      row.push(<span key={'dots' + n.id} className="tv-move tv-dots">…</span>)
    }
    row.push(move(n, false))
    const alts = real(nodes[n.parent!]).slice(1)
    if (n.comment || alts.length) {
      if (cho) row.push(<span key={'gap' + n.id} className="tv-move tv-dots">…</span>)
      flush()
      if (n.comment)
        items.push(
          <p key={'c' + n.id} className="tv-comment">
            {text(n)}
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
    n = real(n).length ? nodes[real(n)[0]] : undefined
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

/** A comment with the moves written in it made clickable */
/** A recorded game's players, event and result, as entered with the game */
function GameCard({ game }: { game: GameInfo }) {
  const where = [game.event, game.round, game.date].filter(Boolean).join(' · ')
  return (
    <div className="study-game">
      <span className="vs">
        <span className="side">초</span>
        {game.cho ?? '?'} <span className="side">vs 한</span>
        {game.han ?? '?'}
      </span>
      {where && <span className="muted">{where}</span>}
      {game.result && <span>{game.result}</span>}
      {game.source && (
        <a href={game.source} target="_blank" rel="noopener noreferrer nofollow">
          대국 영상
        </a>
      )}
    </div>
  )
}

/** Plain comment text with "3챕터" turned into a link to that chapter of the same study */
function chapterRefs(text: string, chapterLink: ChapterLink, key: number): ReactNode[] {
  const out: ReactNode[] = []
  let at = 0
  for (const m of text.matchAll(/(\d+)챕터/g)) {
    const href = chapterLink(+m[1])
    if (!href) continue
    out.push(text.slice(at, m.index))
    out.push(
      <a key={`${key}-${m.index}`} className="tv-chapter-link" href={href} onClick={(e) => e.stopPropagation()}>
        {m[0]}
      </a>,
    )
    at = m.index + m[0].length
  }
  out.push(text.slice(at))
  return out
}

function CommentText({ node, cur, onSelect, chapterLink }: { node: ViewNode; cur: number; onSelect: (id: number) => void; chapterLink: ChapterLink }) {
  const text = node.comment ?? ''
  if (!node.links) return <>{chapterRefs(text, chapterLink, 0)}</>
  const out: ReactNode[] = []
  let at = 0
  for (const l of node.links) {
    out.push(...chapterRefs(text.slice(at, l.start), chapterLink, at))
    out.push(
      <span
        key={l.start}
        className={`tv-link ${cur === l.target ? 'active' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(l.target)
        }}
      >
        {text.slice(l.start, l.end)}
      </span>,
    )
    at = l.end
  }
  out.push(...chapterRefs(text.slice(at), chapterLink, at))
  return <>{out}</>
}
