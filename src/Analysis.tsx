import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Board, { type Arrow } from './Board'
import MoveList from './MoveList'
import ReviewPanel from './ReviewPanel'
import { api } from './net'
import { evaluate, getEngine, type Analysis as EngineAnalysis, type Engine } from './engine'
import { SetupPicker } from "./SetupIcon"
import { moveSound, playSound } from "./sound"
import { classifyOpening } from "./openings"
import { useOpening } from "./openingNames"
import { loadTheory, positionKey } from "./studyData"
import { OpeningBar } from "./OpeningBar"
import Explorer from "./Explorer"
import RecordForm, { RecordBar } from './RecordForm'
import type { RecordDetail } from './recordData'
import {
  type Setup,
  choScore,
  choToMove,
  formatScore,
  isPass,
  countPosition,
  legalNoRepeat,
  pointsEnding,
  lineSan,
  material,
  parseUci,
  parsePieces,
  sanOf,
  startFen,
  replay,
  resultLabel,
  type GameResult,
  withBoard,
} from './janggi'
import { CLASS_INFO, REVIEW_DEPTH, REVIEW_MULTIPV, choWin, reviewMove, type MoveReview, type PosEval, type PrevMove } from "./review"
import { ROOT, addMove, deleteFrom, isMainline, lineFrom, mainline, newTree, pathTo, promote, treeFromMoves, type Tree } from './tree'
import { useHeldKey } from "./ui"
import { EvalBar, IconAnalysis, IconFirst, IconLast, IconNext, IconPrev, IconReview, IconLearn, LineMoves, PlayerTag, evalSide } from './ui'

const LINE_PLIES = 30 // the whole principal variation, practically

export interface GameImport {
  key: string
  startFen: string
  moves: { uci: string; san: string; fen: string }[]
  cho?: string
  han?: string
  review?: boolean
  /** a finished game on the site: its review comes from the server's analysis (prepared during the game) */
  gameId?: string
  /** a tournament record (대회 기보): reviewed by the server too */
  record?: RecordDetail
  result?: GameResult | null
  reason?: string | null
}

export default function Analysis({
  rulesReady,
  active,
  load,
  onNewGame,
  onRecord,
}: {
  rulesReady: boolean
  active: boolean
  load?: GameImport | null
  onNewGame: () => void
  /** open a tournament record (after uploading it) */
  onRecord: (id: string) => void
}) {
  const [engine, setEngine] = useState<Engine | null>(null)
  const [engineError, setEngineError] = useState<string | null>(null)
  const [engineOn, setEngineOn] = useState(true)

  const [choSetup, setChoSetup] = useState<Setup>('마상상마')
  const [hanSetup, setHanSetup] = useState<Setup>('마상상마')
  const [tree, setTree] = useState<Tree>(() => newTree(startFen('마상상마', '마상상마')))
  const [cur, setCur] = useState(ROOT)
  const [names, setNames] = useState<{ cho: string; han: string }>({ cho: '초 (楚)', han: '한 (漢)' })
  const [baseFlipped, setFlipped] = useState(false)
  // holding f shows the board from the other side; releasing it goes back
  const flipped = baseFlipped !== useHeldKey("KeyF", active)
  const [analysis, setAnalysis] = useState<EngineAnalysis | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [tab, setTab] = useState<'analysis' | 'review' | 'explorer'>('analysis')
  const [evals, setEvals] = useState<Record<string, PosEval>>({})
  const [reviewRun, setReviewRun] = useState<{ done: number; total: number } | null>(null)
  const reviewing = reviewRun !== null
  // review mode: on after the first full review; then every visited move gets judged on demand
  const [reviewOn, setReviewOn] = useState(false)
  const [loadedResult, setLoadedResult] = useState<{ at: number; label: string } | null>(null)
  const [fullRun, setFullRun] = useState(false)
  const [record, setRecord] = useState<RecordDetail | null>(null)
  const [showUpload, setShowUpload] = useState(false)

  useEffect(() => {
    getEngine().then(setEngine, (e) => setEngineError(String(e?.message ?? e)))
  }, [])

  const start = tree.nodes[ROOT].fen
  // positions from the study notes count as theory in the review
  const [theory, setTheory] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (rulesReady) loadTheory().then(setTheory, () => {})
  }, [rulesReady])
  const node = tree.nodes[cur]
  const fen = node.fen
  const lastMove = node.uci || undefined

  const position = useMemo(() => {
    if (!rulesReady) return null
    // decided on points as in a game (two passes, 10 points, 200 moves: a FEN does not know the moves before it)
    const path = pathTo(tree, cur)
    const line = path.map((id) => tree.nodes[id].uci)
    const points = line.length ? pointsEnding(line, fen) : null
    if (points) return { legal: [], over: true, result: points.result as string, reason: points.reason }
    // the repetition rule (동일 수 3회 금지) applies along this line, as in a game
    const seen = new Map<string, number>()
    for (const f of [start, ...path.map((id) => tree.nodes[id].fen)]) countPosition(seen, f)
    const legal = legalNoRepeat(fen, seen)
    return withBoard(fen, (b) => {
      const mated = !b.isGameOver() && !legal.length // every move left would repeat
      return {
        legal,
        over: b.isGameOver() || mated,
        result: mated ? (choToMove(fen) ? '0-1' : '1-0') : b.result(),
        reason: mated ? '둘 수 없음 (반복 금지)' : (undefined as string | undefined),
      }
    })
  }, [fen, rulesReady, tree, cur, start])

  // re-analyse whenever the shown position changes
  const pendingUi = useRef<EngineAnalysis | null>(null)
  useEffect(() => {
    if (!engine) return
    setAnalysis(null)
    if (reviewing) return // the review owns the engine; its searches preempt ours
    if (!engineOn || !position || position.over) {
      engine.stop()
      return
    }
    let raf = 0
    engine.analyze(fen, (a) => {
      pendingUi.current = a
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0
          setAnalysis(pendingUi.current)
        })
    })
    return () => cancelAnimationFrame(raf)
  }, [engine, engineOn, fen, position, reviewing])

  const live = analysis && analysis.fen === fen ? analysis : null

  const play = useCallback(
    (uci: string) => {
      const next = withBoard(fen, (b) => {
        const san = sanOf(b, uci)
        b.push(uci)
        return { san, fen: b.fen() }
      })
      const [t, id] = addMove(tree, cur, uci, next.san, next.fen)
      setTree(t)
      setCur(id)
    },
    [fen, tree, cur],
  )

  // hovering a move inside an engine line shows that position on a mini board (chess.com style)
  const [preview, setPreview] = useState<{ fen: string; lastMove: string; x: number; y: number } | null>(null)
  const hoverLine = useCallback(
    (fromFen: string, ucis: string[]) => (i: number | null, el?: HTMLElement) => {
      if (i === null || !el) return setPreview(null)
      const after = replay(fromFen, ucis.slice(0, i + 1)).at(-1)
      if (!after) return
      const r = el.getBoundingClientRect()
      const size = 240
      setPreview({
        fen: after.fen,
        lastMove: after.uci,
        x: Math.max(8, (el.closest(".panel")?.getBoundingClientRect().left ?? r.left) - size - 12),
        y: Math.min(window.innerHeight - size * 1.1 - 8, Math.max(8, r.top - size / 2)),
      })
    },
    [],
  )
  useEffect(() => setPreview(null), [cur])
  const [linesOpen, setLinesOpen] = useState(false)

  // clicking a move inside an engine line plays the line up to it (kept as a variation)
  const playLine = useCallback(
    (from: number, ucis: string[]) => {
      let t = tree
      let at = from
      withBoard(tree.nodes[from].fen, (b) => {
        for (const uci of ucis) {
          const san = sanOf(b, uci)
          b.push(uci)
          ;[t, at] = addMove(t, at, uci, san, b.fen())
        }
      })
      setTree(t)
      setCur(at)
    },
    [tree],
  )

  const passMove = position?.legal.find(isPass)

  const goBack = useCallback(() => setCur((c) => tree.nodes[c].parent ?? c), [tree])
  const goForward = useCallback(() => setCur((c) => tree.nodes[c].children[0] ?? c), [tree])
  const goStart = useCallback(() => setCur(ROOT), [])
  const goEnd = useCallback(() => setCur((c) => lineFrom(tree, c).at(-1) ?? c), [tree])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if (e.key === "ArrowLeft") goBack()
      else if (e.key === 'ArrowRight') goForward()
      else if (e.key === 'ArrowUp' || e.key === 'Home') goStart()
      else if (e.key === 'ArrowDown' || e.key === 'End') goEnd()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, goBack, goForward, goStart, goEnd])

  // engine lines in SAN, with move numbers
  const lines = useMemo(() => {
    if (!live || !rulesReady) return []
    return live.lines.map((l) => ({
      pv: l.pv,
      score: choScore(fen, l),
      san: lineSan(fen, l.pv, LINE_PLIES),
      first: l.pv[0],
    }))
  }, [live, fen, rulesReady])

  // --- game review (main line only) ---
  const main = useMemo(() => mainline(tree), [tree])
  const plies = useMemo(() => main.map((id) => tree.nodes[id]), [main, tree])

  const reviewToken = useRef(0)
  const startReview = useCallback(
    async (target: { fen: string }[] = plies, from: string = start) => {
      const eng = await getEngine()
      const token = ++reviewToken.current
      const fens = [...new Set([from, ...target.map((p) => p.fen)])]
      let have = evals
      const todo = fens.filter((f) => !have[f])
      setReviewRun({ done: fens.length - todo.length, total: fens.length })
      for (const f of todo) {
        if (reviewToken.current !== token) return
        const result = withBoard(f, (b) => (b.isGameOver() ? b.result() : null))
        let e: PosEval
        if (result) {
          const cho = result === '1-0' ? 1 : result === '0-1' ? 0 : 0.5
          e = { lines: [], terminal: choToMove(f) ? cho : 1 - cho }
        } else {
          e = { lines: (await evaluate(eng, f, REVIEW_DEPTH, REVIEW_MULTIPV)).lines }
        }
        have = { ...have, [f]: e }
        setEvals(have)
        setReviewRun((r) => r && { ...r, done: r.done + 1 })
      }
      setReviewRun(null)
    },
    [plies, start, evals],
  )

  const runFullReview = useCallback(
    async (target?: { fen: string }[], from?: string) => {
      setReviewOn(true)
      setFullRun(true)
      await startReview(target, from)
      setFullRun(false)
    },
    [startReview],
  )

  // load a finished game (from the play page)
  const loaded = useRef<string | null>(null)
  useEffect(() => {
    if (!load || !rulesReady || loaded.current === load.key) return
    loaded.current = load.key
    const t = treeFromMoves(load.startFen, load.moves)
    setTree(t)
    // a game to review starts from the beginning; a line from a learning page shows its final position
    setCur(load.review || !load.moves.length ? ROOT : t.nextId - 1)
    setNames({ cho: load.cho ?? '초 (楚)', han: load.han ?? '한 (漢)' })
    setRecord(load.record ?? null)
    setShowUpload(false)
    // the stored result belongs to the loaded line's last move (it may be a resignation, not visible on the board)
    setLoadedResult(load.result ? { at: load.moves.length ? t.nextId - 1 : ROOT, label: resultLabel(load.result, load.reason) } : null)
    if (load.review) {
      setTab('review')
      if (load.record) fetchServerReview(`/records/${load.record.id}/analysis`, load)
      else if (load.gameId) fetchServerReview(`/games/${load.gameId}/analysis`, load)
      else runFullReview(load.moves, load.startFen)
    }
  }, [load, rulesReady, runFullReview]) // eslint-disable-line react-hooks/exhaustive-deps

  // a site game: the server analysed it (mostly while it was played); show its progress until all positions are in.
  // A tournament record is analysed by the server as soon as it is uploaded. If the server cannot help, the browser
  // reviews it as before.
  const serverPoll = useRef(0)
  const fetchServerReview = async (analysisPath: string, game: GameImport) => {
    const token = ++serverPoll.current
    setReviewOn(true)
    setFullRun(true)
    for (;;) {
      let r: { total: number; done: number; evals: Record<string, PosEval> }
      try {
        r = await api(analysisPath)
      } catch {
        if (serverPoll.current !== token) return
        setFullRun(false)
        return runFullReview(game.moves, game.startFen)
      }
      if (serverPoll.current !== token) return
      setEvals((e) => ({ ...e, ...r.evals }))
      if (r.done >= r.total) {
        setReviewRun(null)
        setFullRun(false)
        return
      }
      setReviewRun({ done: r.done, total: r.total })
      await new Promise((ok) => setTimeout(ok, 2000))
    }
  }
  useEffect(() => () => void ++serverPoll.current, [])

  // every move in the tree (main line and variations) that has evaluations gets a class
  const treeReviews = useMemo(() => {
    const m = new Map<number, MoveReview>()
    if (!rulesReady) return m
    // theory only runs from the first move without a break: once a line leaves it, later moves are not theory
    const walk = (id: number, ucis: string[], inBook: boolean) => {
      const n = tree.nodes[id]
      const prev: PrevMove | null =
        n.parent === null ? null : { uci: n.uci, before: tree.nodes[n.parent].fen, review: m.get(id) ?? null }
      for (const c of n.children) {
        const line = [...ucis, tree.nodes[c].uci]
        let r = reviewMove(n.fen, tree.nodes[c].uci, tree.nodes[c].fen, prev, evals)
        // theory (이론에 있는 수): a move that builds the recognized formation, or a position from the study notes,
        // unless the engine calls it a mistake
        const inTheory = () => theory.has(positionKey(tree.nodes[c].fen)) || classifyOpening(start, line).book.has(line.length - 1)
        const book = inBook && !!r && r.loss <= 0.1 && line.length <= 40 && inTheory()
        if (book) r = { ...r!, cls: 'book', isBest: true }
        if (r) m.set(c, r)
        walk(c, line, book)
      }
    }
    walk(ROOT, [], true)
    return m
  }, [rulesReady, tree, evals, start, theory])
  const reviews = useMemo(() => main.map((id) => treeReviews.get(id) ?? null), [main, treeReviews])
  const reviewed = plies.length > 0 && reviews.every(Boolean)
  const classes = useMemo(() => new Map([...treeReviews].map(([id, r]) => [id, r.cls])), [treeReviews])
  const openingLine = useMemo(() => pathTo(tree, cur).map((id) => tree.nodes[id].uci), [tree, cur])
  const opening = useOpening(start, openingLine, rulesReady)
  const curReview = treeReviews.get(cur) ?? null

  // sounds: stepping one move forward plays that move's sound; a 탁월한 수 in the review tab gets its own
  const lastSoundAt = useRef(ROOT)
  const brilliantPlayed = useRef(-1)
  useEffect(() => {
    const from = lastSoundAt.current
    lastSoundAt.current = cur
    if (!active || !rulesReady || cur === ROOT || tree.nodes[cur].parent !== from) return
    const n = tree.nodes[cur]
    const { to } = parseUci(n.uci)
    const capture = !isPass(n.uci) && parsePieces(tree.nodes[from].fen).has(to)
    playSound(moveSound({ capture, check: withBoard(n.fen, (b) => b.isCheck()), over: !!position?.over }))
  }, [cur]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (active && tab === "review" && curReview?.cls === "brilliant" && brilliantPlayed.current !== cur) {
      brilliantPlayed.current = cur
      setTimeout(() => playSound("brilliant"), 150)
    }
  }, [active, tab, cur, curReview])
  const prevFen = node.parent !== null ? tree.nodes[node.parent].fen : start

  // In the review tab, a move off the reviewed line gets evaluated right away (it and the position before it).
  useEffect(() => {
    if (tab !== "review" || !reviewOn || fullRun || reviewing || cur === ROOT) return
    const need = [...new Set([prevFen, fen])].filter((f) => !evals[f])
    if (need.length) startReview(need.map((f) => ({ fen: f })), need[0])
  }, [tab, reviewOn, fullRun, reviewing, cur, prevFen, fen, evals, startReview])

  // result shown after the main line: the loaded game's result, or the rules' verdict if the line ends the game
  const mainEnd = main.at(-1) ?? ROOT
  const mainResult = useMemo(() => {
    if (loadedResult && loadedResult.at === mainEnd) return loadedResult.label
    if (!rulesReady || mainEnd === ROOT) return null
    const line = main.map((id) => tree.nodes[id].uci)
    const points = pointsEnding(line, tree.nodes[mainEnd].fen)
    if (points) return resultLabel(points.result, points.reason)
    return withBoard(tree.nodes[mainEnd].fen, (b) => {
      if (!b.isGameOver()) return null
      const reason = b.isCheck() && b.numberLegalMoves() === 0 ? "외통" : "규칙"
      return resultLabel(b.result() as GameResult, reason)
    })
  }, [loadedResult, mainEnd, rulesReady, tree, main])

  // captured pieces and points (with 덤) for the player tags
  const mat = useMemo(() => material(fen), [fen])
  const matFor = (s: "cho" | "han") => ({ ...mat[s], lead: mat[s].score - mat[s === "cho" ? "han" : "cho"].score })

  const stored = evals[fen]
  const storedScore = stored
    ? stored.terminal !== undefined
      ? { mate: choWin(fen, stored) > 0.5 ? 1 : -1 }
      : stored.lines[0] && choScore(fen, stored.lines[0])
    : undefined
  const top = lines[0]?.score
  const barScore = top ?? storedScore ?? { cp: 0 }

  const arrows: Arrow[] = []
  if (tab === 'review') {
    if (curReview && !curReview.isBest && curReview.best && !isPass(curReview.best)) {
      const { from, to } = parseUci(curReview.best)
      arrows.push({ from, to, color: 'var(--arrow-review)' })
    }
  } else if (engineOn && lines[0]?.first && !isPass(lines[0].first)) {
    const { from, to } = parseUci(lines[0].first)
    arrows.push({ from, to, color: 'var(--arrow-best)' })
  }

  const newGame = () => {
    setReviewOn(false)
    reviewToken.current++
    setReviewRun(null)
    setTree(newTree(startFen(choSetup, hanSetup)))
    setCur(ROOT)
    setNames({ cho: "초 (楚)", han: "한 (漢)" })
    setLoadedResult(null)
    setRecord(null)
    setShowSetup(false)
  }

  const resultText = () => {
    if (!position?.over) return null
    const r = position.result
    const head = r === '1-0' ? '초 승' : r === '0-1' ? '한 승' : '무승부'
    return position.reason ? `${head} · ${position.reason}` : head
  }

  const onDelete = (id: number) => {
    const parent = tree.nodes[id].parent ?? ROOT
    if (pathTo(tree, cur).includes(id)) setCur(parent)
    setTree(deleteFrom(tree, id))
  }

  return (
    <div className="app">
      {preview && (
        <div className="mini-board" style={{ left: preview.x, top: preview.y }}>
          <Board fen={preview.fen} legal={[]} flipped={flipped} lastMove={preview.lastMove} arrows={[]} interactive={false} onMove={() => {}} />
        </div>
      )}
      <div className="board-area">
        <EvalBar score={barScore} flipped={flipped} hidden={!engineOn} />
        <div className="board-col">
          <PlayerTag name={flipped ? names.cho : names.han} side={flipped ? "cho" : "han"} material={matFor(flipped ? "cho" : "han")} />
          <div className="board-wrap">
            {position ? (
              <Board
                fen={fen}
                legal={position.legal}
                flipped={flipped}
                lastMove={lastMove}
                lastMoveColor={curReview ? CLASS_INFO[curReview.cls].color + '80' : undefined}
                badge={curReview?.cls}
                arrows={arrows}
                interactive={!position.over}
                onMove={play}
              />
            ) : (
              <div className="loading">규칙 엔진 불러오는 중…</div>
            )}
          </div>
          <PlayerTag name={flipped ? names.han : names.cho} side={flipped ? "han" : "cho"} material={matFor(flipped ? "han" : "cho")} />
        </div>
      </div>

      <aside className="panel">
        <header className="panel-head tabs">
          <button className={`tab ${tab === 'analysis' ? 'active' : ''}`} onClick={() => setTab('analysis')}>
            <IconAnalysis /> 분석
          </button>
          <button className={`tab ${tab === 'review' ? 'active' : ''}`} onClick={() => setTab('review')}>
            <IconReview /> 게임 리뷰
          </button>
          <button className={`tab ${tab === 'explorer' ? 'active' : ''}`} onClick={() => setTab('explorer')}>
            <IconLearn /> 탐색기
          </button>
        </header>

        {tab === 'review' && (
          <ReviewPanel
            canStart={!!engine && plies.length > 0 && !reviewing}
            reviewed={reviewed || (reviewOn && !fullRun)}
            run={reviewRun}
            onStart={() => runFullReview()}
            cur={node.ply}
            plies={plies}
            start={start}
            prevFen={prevFen}
            review={curReview}
            move={cur === ROOT ? null : { san: node.san, fen: node.fen }}
            evaluating={reviewing}
            onHoverBest={node.parent !== null ? hoverLine(tree.nodes[node.parent].fen, curReview?.bestLine ?? []) : undefined}
            onPickBest={(ucis) => node.parent !== null && playLine(node.parent, ucis)}
            reviews={reviews}
            evals={evals}
            onSelect={(i) => setCur(i === 0 ? ROOT : main[i - 1])}
          />
        )}

        {tab === 'analysis' && (
          <section className="engine">
            <div className="engine-head">
              <label className="switch">
                <input type="checkbox" checked={engineOn} onChange={(e) => setEngineOn(e.target.checked)} />
                <span />
              </label>
              {engineOn && top ? <span className={`eval-big ${evalSide(top)}`}>{formatScore(top)}</span> : null}
              {engineOn && (
                <button className="lines-toggle" title={linesOpen ? "수순 접기" : "수순 펼치기"} onClick={() => setLinesOpen((o) => !o)}>
                  {linesOpen ? "▴" : "▾"}
                </button>
              )}
              <span className="engine-name">
                {engineError
                  ? `엔진 오류: ${engineError}`
                  : !engine
                    ? '엔진 불러오는 중…'
                    : reviewing
                      ? '게임 리뷰 분석 중…'
                      : `Fairy-Stockfish NNUE${live ? ` · 깊이 ${live.depth}` : ''}`}
              </span>
            </div>
            {engineOn && (
              <div className={`lines ${linesOpen ? "open" : ""}`}>
                {position?.over ? (
                  <div className="line muted">{resultText()}</div>
                ) : (
                  [0, 1, 2].map((i) => {
                    const l = lines[i]
                    return (
                      <div className="line" key={i}>
                        {l ? (
                          <>
                            <span className={`chip ${evalSide(l.score)}`}>{formatScore(l.score)}</span>
                            <span className="line-moves">
                              <LineMoves
                                fen={fen}
                                sans={l.san}
                                onPick={(i) => playLine(cur, l.pv.slice(0, i + 1))}
                                onHover={hoverLine(fen, l.pv)}
                              />
                            </span>
                          </>
                        ) : (
                          <span className="line-moves muted">…</span>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </section>
        )}

        {tab === 'explorer' && <Explorer fen={fen} onPlay={play} onOpenRecord={onRecord} />}
        {record && <RecordBar record={record} onChange={(r) => (setRecord(r), setNames({ cho: r.cho, han: r.han }))} onDeleted={newGame} />}
        <OpeningBar opening={opening} />
        <MoveList
          result={mainResult}
          tree={tree}
          current={cur}
          classes={classes}
          onSelect={setCur}
          onDelete={onDelete}
          onPromote={(id) => setTree(promote(tree, id))}
        />

        {position?.over && <div className="result-banner">{resultText()}</div>}
        {!isMainline(tree, cur) && <div className="variation-note">변화도를 보고 있어요 · 우클릭으로 올리기/삭제</div>}

        <footer className="controls">
          <button title="처음 (↑)" onClick={goStart}>
            <IconFirst />
          </button>
          <button title="이전 (←)" onClick={goBack}>
            <IconPrev />
          </button>
          <button title="다음 (→)" onClick={goForward}>
            <IconNext />
          </button>
          <button title="마지막 (↓)" onClick={goEnd}>
            <IconLast />
          </button>
        </footer>
        <div className="actions">
          <button className="btn" disabled={!passMove} onClick={() => passMove && play(passMove)}>
            한수쉼
          </button>
          <button className="btn" onClick={() => setFlipped((f) => !f)}>
            판 뒤집기
          </button>
          {tab === "review" ? (
            <button className="btn primary" onClick={onNewGame}>
              새 대국
            </button>
          ) : (
            <button className="btn" onClick={() => setShowSetup((s) => !s)}>
              새 판
            </button>
          )}
        </div>
        {!record && plies.length >= 10 && (
          <button className="btn upload-toggle" onClick={() => setShowUpload(true)}>
            이 기보를 대회 기보로 올리기
          </button>
        )}
        {showUpload && !record && (
          <div className="record-modal-back" onClick={() => setShowUpload(false)}>
            <div className="record-modal" onClick={(e) => e.stopPropagation()}>
              <header>
                <h3>대회 기보로 올리기</h3>
                <button title="닫기" onClick={() => setShowUpload(false)}>
                  ✕
                </button>
              </header>
              <RecordForm
                start={start}
                moves={plies.map((p) => p.uci)}
                onDone={(id) => {
                  setShowUpload(false)
                  onRecord(id)
                }}
              />
            </div>
          </div>
        )}
        {showSetup && tab === "analysis" && (
          <div className="setup">
            <div className="setup-label">한 차림 <span className="muted small">(판 아래쪽에서 본 모습)</span></div>
            <SetupPicker side="han" value={hanSetup} mirror onPick={setHanSetup} />
            <div className="setup-label">초 차림</div>
            <SetupPicker side="cho" value={choSetup} onPick={setChoSetup} />
            <button className="btn primary" onClick={newGame}>
              시작
            </button>
          </div>
        )}
      </aside>
    </div>
  )
}
