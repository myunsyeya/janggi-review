// Editor for a user's own study: chapters on the left, the board in the middle (moves make the tree, right-drag
// draws), and on the right the move list with the selected move's comment, glyph and position name.
// Saved as the same text format as the official studies; the server checks every move.
// A chapter can also be a recorded game: its players, event and result are shown with it.
import { useEffect, useMemo, useState } from 'react'
import Board from './Board'
import MoveList from './MoveList'
import { SETUPS, sanOf, withBoard, type Setup } from './janggi'
import { api, savedToken } from './net'
import type { GameInfo } from './studyFormat'
import { GLYPH_CHOICES, blankChapter, fromChapter, toArrows, toPgn, toShapes, type EditChapter, type Note } from './studyEdit'
import { chapterHref, loadStudy, loadTopics, type Study } from './studyData'
import { ROOT, addMove, deleteFrom, promote } from './tree'
import { IconFirst, IconLast, IconNext, IconPrev, useHeldKey } from './ui'

export default function StudyEditor({ id, active, rulesReady }: { id: string; active: boolean; rulesReady: boolean }) {
  const [study, setStudy] = useState<Study | null | undefined>(undefined)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [topics, setTopics] = useState<string[]>([])
  const [published, setPublished] = useState(false)
  const [chapters, setChapters] = useState<EditChapter[]>([])
  const [ci, setCi] = useState(0)
  const [cur, setCur] = useState(ROOT)
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [allTopics, setAllTopics] = useState<string[]>([])
  const [baseFlipped, setFlipped] = useState(false)
  const flipped = baseFlipped !== useHeldKey('KeyF', active)

  useEffect(() => {
    if (!rulesReady) return
    loadStudy(id).then((s) => {
      if (!s?.owner) return setStudy(null)
      setStudy(s)
      setTitle(s.title)
      setDescription(s.description)
      setTopics(s.topics)
      setPublished(!!s.published)
      setChapters(s.chapters.map(fromChapter))
    })
    loadTopics().then((t) => setAllTopics(Object.keys(t)))
  }, [id, rulesReady])

  // warn before leaving with unsaved changes
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const ch = chapters[ci]
  const node = ch?.tree.nodes[cur] ?? ch?.tree.nodes[ROOT]
  const note: Note = (ch && ch.notes[node.id]) || {}
  const legal = useMemo(() => (node && rulesReady ? withBoard(node.fen, (b) => b.legalMoves().split(' ').filter(Boolean)) : []), [node, rulesReady])

  const change = (f: (c: EditChapter) => EditChapter) => {
    setChapters((cs) => cs.map((c, i) => (i === ci ? f(c) : c)))
    setDirty(true)
    setStatus(null)
  }
  const setNote = (patch: Partial<Note>) => change((c) => ({ ...c, notes: { ...c.notes, [node.id]: { ...c.notes[node.id], ...patch } } }))

  const play = (uci: string) => {
    const next = withBoard(node.fen, (b) => {
      const san = sanOf(b, uci)
      b.push(uci)
      return { san, fen: b.fen() }
    })
    const [tree, nid] = addMove(ch.tree, node.id, uci, next.san, next.fen)
    if (tree !== ch.tree) change((c) => ({ ...c, tree }))
    setCur(nid)
  }

  const go = (to: number | undefined) => to !== undefined && ch.tree.nodes[to] && setCur(to)
  const lineEnd = () => {
    let n = node
    while (n.children.length) n = ch.tree.nodes[n.children[0]]
    return n.id
  }
  useEffect(() => {
    if (!active || !ch) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
      if (e.key === 'ArrowLeft') go(node.parent ?? undefined)
      else if (e.key === 'ArrowRight') go(node.children[0])
      else if (e.key === 'ArrowUp') go(ROOT)
      else if (e.key === 'ArrowDown') go(lineEnd())
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const pickChapter = (i: number) => {
    setCi(i)
    setCur(ROOT)
  }
  const addChapter = () => {
    const last = chapters[chapters.length - 1]
    setChapters((cs) => [...cs, blankChapter(`${cs.length + 1}챕터`, last?.cho ?? '마상상마', last?.han ?? '마상상마')])
    setDirty(true)
    setCi(chapters.length)
    setCur(ROOT)
  }
  const removeChapter = () => {
    if (chapters.length < 2) return alert('챕터는 하나 이상 있어야 해요')
    if (!confirm(`"${ch.name}" 챕터를 지울까요?`)) return
    setChapters((cs) => cs.filter((_, i) => i !== ci))
    setDirty(true)
    setCi(Math.max(0, ci - 1))
    setCur(ROOT)
  }
  const moveChapter = (d: -1 | 1) => {
    const j = ci + d
    if (j < 0 || j >= chapters.length) return
    setChapters((cs) => {
      const next = [...cs]
      ;[next[ci], next[j]] = [next[j], next[ci]]
      return next
    })
    setDirty(true)
    setCi(j)
  }
  const setSetup = (side: 'cho' | 'han', s: Setup) => {
    if (Object.keys(ch.tree.nodes).length > 1 && !confirm('차림을 바꾸면 이 챕터의 수가 모두 지워져요. 바꿀까요?')) return
    const fresh = blankChapter(ch.name, side === 'cho' ? s : ch.cho, side === 'han' ? s : ch.han)
    change((c) => ({ ...fresh, id: c.id, topics: c.topics, notes: (c.notes[ROOT] ? { [ROOT]: c.notes[ROOT] } : {}) as Record<number, Note> }))
    setCur(ROOT)
  }

  const save = async (publish = published) => {
    setSaving(true)
    setStatus(null)
    try {
      const r = await api<{ chapters: string[] }>(`/user-studies/${id}/save`, savedToken(), {
        title,
        description,
        topics,
        published: publish,
        chapters: chapters.map((c) => ({ id: c.id, pgn: toPgn(c) })),
      })
      setChapters((cs) => cs.map((c, i) => ({ ...c, id: r.chapters[i] })))
      setPublished(publish)
      setDirty(false)
      setStatus(publish ? '저장했어요 (공개 중)' : '저장했어요 (비공개)')
    } catch (e) {
      setStatus((e as Error).message)
    } finally {
      setSaving(false)
    }
  }
  const setGame = (key: keyof GameInfo, v: string) =>
    change((c) => {
      const game = { ...c.game, [key]: v || undefined }
      return { ...c, game: Object.values(game).some(Boolean) ? game : undefined }
    })
  const remove = async () => {
    if (!confirm('이 연구를 지울까요? 되돌릴 수 없어요.')) return
    try {
      await api(`/user-studies/${id}/delete`, savedToken(), {})
      setDirty(false)
      location.href = '/study'
    } catch (e) {
      alert((e as Error).message)
    }
  }

  if (study === null) return <div className="studies muted pad">내 연구만 고칠 수 있어요. 로그인했는지 확인해 주세요.</div>
  if (!study || !ch || !node) return <div className="studies muted pad">불러오는 중…</div>

  const viewHref = ch.id ? chapterHref({ id, chapters: chapters.map((c) => ({ id: c.id ?? '' })) }, ch.id) : `/study/${id}`

  return (
    <div className="study study-editor">
      <aside className="study-chapters">
        <div className="study-chapters-head">{chapters.length} 챕터</div>
        <ol>
          {chapters.map((c, i) => (
            <li key={i} className={i === ci ? 'active' : ''}>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  pickChapter(i)
                }}
              >
                <span className="ch-no">{i + 1}</span>
                {c.name || '(이름 없음)'}
              </a>
            </li>
          ))}
        </ol>
        <div className="editor-chapter-tools">
          <button onClick={addChapter}>+ 챕터</button>
          <button onClick={() => moveChapter(-1)} disabled={ci === 0} title="위로">
            ↑
          </button>
          <button onClick={() => moveChapter(1)} disabled={ci === chapters.length - 1} title="아래로">
            ↓
          </button>
          <button onClick={removeChapter} title="이 챕터 지우기">
            지우기
          </button>
        </div>
      </aside>

      <section className="study-board">
        <div className="board-wrap study-board-wrap">
          <Board
            fen={node.fen}
            legal={legal}
            flipped={flipped}
            lastMove={node.uci || undefined}
            arrows={[]}
            drawn={toArrows(note.shapes)}
            onDraw={(a) => setNote({ shapes: toShapes(a) })}
            interactive
            onMove={play}
          />
        </div>
        <div className="editor-meta">
          <input className="editor-title" value={title} maxLength={60} placeholder="연구 제목" onChange={(e) => (setTitle(e.target.value), setDirty(true))} />
          <textarea
            value={description}
            maxLength={200}
            rows={2}
            placeholder="연구 소개 (목록과 검색 결과에 나와요)"
            onChange={(e) => (setDescription(e.target.value), setDirty(true))}
          />
          <div className="editor-topics">
            {allTopics.map((t) => (
              <button
                key={t}
                className={topics.includes(t) ? 'on' : ''}
                onClick={() => {
                  setTopics((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t].slice(0, 5)))
                  setDirty(true)
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="editor-actions">
            <button className="btn primary" disabled={saving} onClick={() => save()}>
              {saving ? '저장 중…' : dirty ? '저장' : '저장됨'}
            </button>
            <button className="btn" disabled={saving} onClick={() => save(!published)}>
              {published ? '비공개로 돌리기' : '저장하고 공개'}
            </button>
            <a className="btn" href={viewHref}>
              보기
            </a>
            <button className="btn danger" onClick={remove}>
              연구 지우기
            </button>
            {status && <span className="editor-status">{status}</span>}
          </div>
        </div>
        <details className="editor-game" key={ci} open={!!ch.game || undefined}>
          <summary>대회 기보 (선택): 이 챕터가 실제 대국이면 대국 정보를 적어 주세요</summary>
          <div className="editor-game-grid">
            {(
              [
                ['cho', '초 대국자', '이름'],
                ['han', '한 대국자', '이름'],
                ['event', '대회', '예: 2026 전국장기대회'],
                ['round', '라운드', '예: 결승'],
                ['date', '날짜', ''],
                ['result', '결과', '예: 한 승 (외통)'],
                ['source', '영상 링크', 'https://…'],
              ] as [keyof GameInfo, string, string][]
            ).map(([key, label, hint]) => (
              <label key={key} className={key === 'source' || key === 'event' ? 'wide' : ''}>
                {label}
                <input
                  type={key === 'date' ? 'date' : key === 'source' ? 'url' : 'text'}
                  value={ch.game?.[key] ?? ''}
                  maxLength={key === 'source' ? 300 : 60}
                  placeholder={hint}
                  onChange={(e) => setGame(key, e.target.value)}
                />
              </label>
            ))}
          </div>
          <div className="muted small">
            본 수순(첫 줄)이 실제 기보예요. 대회 기보를 게임 리뷰와 연구자의 분석으로 보고 싶다면 분석판에서 <a href="/records">대회 기보로 올려</a> 주세요.
          </div>
        </details>
      </section>

      <section className="study-side editor-side">
        <div className="editor-chapter">
          <input value={ch.name} maxLength={60} placeholder="챕터 이름" onChange={(e) => change((c) => ({ ...c, name: e.target.value }))} />
          <label>
            초
            <select value={ch.cho} onChange={(e) => setSetup('cho', e.target.value as Setup)}>
              {SETUPS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            한
            <select value={ch.han} onChange={(e) => setSetup('han', e.target.value as Setup)}>
              {SETUPS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <MoveList
          tree={ch.tree}
          current={node.id}
          classes={new Map()}
          onSelect={setCur}
          onDelete={(nid) => {
            const parent = ch.tree.nodes[nid].parent ?? ROOT
            change((c) => ({ ...c, tree: deleteFrom(c.tree, nid) }))
            setCur(parent)
          }}
          onPromote={(nid) => change((c) => ({ ...c, tree: promote(c.tree, nid) }))}
          emptyText="판에 수를 두면 여기에 쌓여요. 다른 수를 두면 변화가 돼요."
        />
        <div className="editor-note">
          <div className="editor-note-head">{node.id === ROOT ? '챕터 첫 해설 (요약)' : `${Math.ceil(node.ply / 2)}${node.ply % 2 ? '.' : '...'} ${node.san} 해설`}</div>
          {node.id !== ROOT && (
            <div className="editor-glyphs">
              {GLYPH_CHOICES.map((g) => (
                <button key={g} className={note.glyph === g ? 'on' : ''} onClick={() => setNote({ glyph: note.glyph === g ? undefined : g })}>
                  {g}
                </button>
              ))}
            </div>
          )}
          <textarea
            value={note.comment ?? ''}
            rows={4}
            placeholder={node.id === ROOT ? '이 챕터에서 무엇을 보는지 한두 문장으로' : '이 수에 대한 해설. 수를 적을 때 번호를 붙이면(예: 2...Hd8 3. Hg3) 눌러서 볼 수 있어요.'}
            onChange={(e) => setNote({ comment: e.target.value })}
          />
          {node.id !== ROOT && (
            <input
              value={note.name ?? ''}
              maxLength={40}
              placeholder="이 국면의 이름 (선택, 예: 최국수포진)"
              onChange={(e) => setNote({ name: e.target.value || undefined })}
            />
          )}
          <div className="muted small">
            오른쪽 드래그로 화살표·원(같은 칸)을 그려요. Shift 초록, Ctrl 빨강, Alt 파랑. f를 누르는 동안 판이 뒤집혀요.
          </div>
        </div>
        <footer className="controls study-controls">
          <button title="처음 (↑)" disabled={node.id === ROOT} onClick={() => go(ROOT)}>
            <IconFirst />
          </button>
          <button title="이전 (←)" disabled={node.id === ROOT} onClick={() => go(node.parent ?? undefined)}>
            <IconPrev />
          </button>
          <button title="다음 (→)" disabled={!node.children.length} onClick={() => go(node.children[0])}>
            <IconNext />
          </button>
          <button title="이 줄의 끝 (↓)" disabled={!node.children.length} onClick={() => go(lineEnd())}>
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
