import { useEffect, useMemo, useRef, useState } from 'react'
import Board from './Board'
import MoveList from './MoveList'
import type { GameImport } from './Analysis'
import { type Setup, isPass, material, resultLabel, parsePieces, parseUci, replay, startFen, withBoard } from "./janggi"
import { moveSound, playSound } from "./sound"
import { Conn, api, saveToken, savedToken, type GameSummary, type GameView, type PublicUser, type Side } from './net'
import { treeFromMoves } from "./tree"
import { SetupIcon, SetupPicker } from "./SetupIcon"
import GameRow, { loadGameImport } from "./GameRow"
import { Avatar, EvalBar, useHeldKey, IconFirst, IconLast, IconNext, IconPrev, PlayerTag, formatClock } from "./ui"

const tagged = (u: { nick: string; tag: string }) => `${u.nick}#${u.tag}`
const SIDE_NAME: Record<Side, string> = { cho: "초", han: "한" }
const SUBJECT: Record<Side, string> = { cho: "초가", han: "한이" }
const IS: Record<Side, string> = { cho: "초예요", han: "한이에요" }

export default function Play({
  rulesReady,
  seek,
  active,
  onReview,
}: {
  rulesReady: boolean
  seek: number
  active: boolean
  onReview: (g: GameImport) => void
}) {
  const [token, setToken] = useState<string | null>(() => savedToken())
  const [me, setMe] = useState<PublicUser | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [queue, setQueue] = useState<{ waiting: boolean; count: number }>({ waiting: false, count: 0 })
  const [game, setGame] = useState<(GameView & { receivedAt: number }) | null>(null)
  const [history, setHistory] = useState<GameSummary[]>([])
  const [hoverSetup, setHoverSetup] = useState<Setup | null>(null)
  const [viewPly, setViewPly] = useState<number | null>(null) // null = follow the live position
  const [, tick] = useState(0)
  const peek = useHeldKey("KeyF", active) // hold f to look from the opponent's side
  const conn = useRef<Conn | null>(null)

  // connect while logged in
  useEffect(() => {
    if (!token) return
    const c = new Conn(
      token,
      (m) => {
        if (m.t === 'me') setMe(m.user)
        else if (m.t === 'queue') setQueue({ waiting: m.waiting, count: m.count })
        else if (m.t === 'game') setGame({ ...m.game, receivedAt: Date.now() })
      },
      setConnected,
    )
    conn.current = c
    api<{ user: PublicUser }>('/me', token).catch(() => {
      // stale token
      c.close()
      saveToken(null)
      setToken(null)
    })
    return () => c.close()
  }, [token])

  const refreshLists = () => {
    if (token) api<{ games: GameSummary[] }>('/games', token).then((r) => setHistory(r.games), () => {})
  }
  useEffect(refreshLists, [token]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (game?.phase === 'over') refreshLists()
  }, [game?.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // clocks tick locally between server updates
  const live = game && (game.phase === 'play' || game.phase.startsWith('setup'))
  useEffect(() => {
    if (!live) return
    const id = setInterval(() => tick((t) => t + 1), 100)
    return () => clearInterval(id)
  }, [live])

  // "새 대국" from the review page: join the queue as soon as we are connected
  const handledSeek = useRef(0)
  useEffect(() => {
    if (!seek || seek === handledSeek.current || !connected) return
    if (game && game.phase !== "over") return
    handledSeek.current = seek
    setGame(null)
    conn.current?.send({ t: "queue" })
  }, [seek, connected, game])

  const mySide: Side | null = game && me ? (game.cho.id === me.id ? 'cho' : game.han.id === me.id ? 'han' : null) : null
  const send = (msg: Record<string, unknown>) => conn.current?.send(msg)

  // positions of the game so far
  const plies = useMemo(() => {
    if (!rulesReady || !game?.startFen) return []
    return replay(game.startFen, game.moves)
  }, [rulesReady, game?.startFen, game?.moves])
  const tree = useMemo(
    () => treeFromMoves(game?.startFen ?? startFen('마상상마', '마상상마'), plies),
    [game?.startFen, plies],
  )
  useEffect(() => setViewPly(null), [plies.length])

  // sounds for live games: each new move, game start and game end
  const heard = useRef<{ id: string; moves: number; phase: string } | null>(null)
  useEffect(() => {
    if (!game || !rulesReady) return
    const h = heard.current
    heard.current = { id: game.id, moves: plies.length, phase: game.phase }
    if (!h || h.id !== game.id) return
    if (plies.length === h.moves + 1) {
      const last = plies[plies.length - 1]
      const before = plies.length > 1 ? plies[plies.length - 2].fen : game.startFen!
      const capture = !isPass(last.uci) && parsePieces(before).has(parseUci(last.uci).to)
      playSound(moveSound({ capture, check: withBoard(last.fen, (b) => b.isCheck()), over: game.phase === "over" }))
    } else if (h.phase !== game.phase) {
      if (game.phase === "play") playSound("start")
      else if (game.phase === "over") playSound("end")
    }
  }, [game, plies, rulesReady])

  const shownPly = viewPly ?? plies.length
  const fen = shownPly > 0 ? plies[shownPly - 1].fen : (game?.startFen ?? previewFen(game, mySide, hoverSetup))
  const atLive = shownPly === plies.length
  const legal = useMemo(() => {
    if (!rulesReady || !game || game.phase !== 'play' || !atLive || game.turn !== mySide) return []
    return withBoard(fen, (b) => b.legalMoves().split(' ').filter(Boolean))
  }, [rulesReady, game, atLive, mySide, fen])

  // premove: on the opponent's turn, moves are queued (from the position as if it were our turn)
  // and sent the moment the opponent's move arrives, if still legal there
  const [premove, setPremove] = useState<string | null>(null)
  const premoveDests = useMemo(() => {
    if (!rulesReady || !game || game.phase !== "play" || !atLive || !mySide || game.turn === mySide) return []
    const parts = fen.split(" ")
    parts[1] = mySide === "cho" ? "w" : "b"
    try {
      return withBoard(parts.join(" "), (b) => b.legalMoves().split(" ").filter((m) => m && !isPass(m)))
    } catch {
      return []
    }
  }, [rulesReady, game, atLive, mySide, fen])
  useEffect(() => {
    if (!premove || !game) return
    if (game.phase !== "play") return setPremove(null)
    if (game.turn !== mySide) return
    setPremove(null)
    if (legal.includes(premove)) conn.current?.send({ t: "move", game: game.id, uci: premove })
  }, [game, mySide, legal, premove])

  const clock = (side: Side) => {
    if (!game) return undefined
    const elapsed = game.phase === 'play' && game.turn === side ? Date.now() - game.receivedAt : 0
    return game.clock[side] - elapsed
  }

  // keyboard: step through the game
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'ArrowLeft') setViewPly(Math.max(0, shownPly - 1))
      else if (e.key === 'ArrowRight') setViewPly(Math.min(plies.length, shownPly + 1))
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, shownPly, plies.length])

  if (!token) return <Login onLogin={(t, u, created) => {
    saveToken(t)
    setToken(t)
    setMe(u)
    setNotice(created ? `새 계정이 만들어졌어요: ${tagged(u)}` : null)
  }} />

  const mat = material(fen)
  const matFor = (s: Side) => ({ ...mat[s], lead: mat[s].score - mat[s === "cho" ? "han" : "cho"].score })
  const flipped = (mySide === "han") !== peek
  const bottom: Side = flipped ? 'han' : 'cho'
  const top: Side = flipped ? 'cho' : 'han'
  const inGame = game && game.phase !== 'over'
  const lastMove = shownPly > 0 ? plies[shownPly - 1].uci : undefined
  const passMove = legal.find(isPass)

  const player = (side: Side) =>
    game ? (
      <PlayerTag
        name={tagged(game[side])}
        side={side}
        rating={game[side].rating}
        clock={clock(side)}
        active={game.phase === "play" && game.turn === side}
        avatar={game[side].avatar}
        material={game.startFen ? matFor(side) : undefined}
      />
    ) : (
      <PlayerTag
        name={side === bottom && me ? tagged(me) : "상대"}
        side={side}
        rating={side === bottom ? me?.rating : undefined}
        avatar={side === bottom ? me?.avatar : undefined}
      />
    )

  return (
    <div className="app">
      <div className="board-area">
        <EvalBar score={{ cp: 0 }} flipped={false} hidden />
        <div className="board-col">
          {player(top)}
          <div className="board-wrap">
            {rulesReady ? (
              <Board
                fen={fen}
                legal={legal.length ? legal : premoveDests}
                flipped={flipped}
                lastMove={lastMove}
                arrows={[]}
                interactive={legal.length > 0 || premoveDests.length > 0}
                mover={mySide ?? undefined}
                premove={premove}
                onCancel={() => setPremove(null)}
                onMove={(uci) => {
                  if (!game) return
                  if (legal.length) send({ t: "move", game: game.id, uci })
                  else setPremove(uci)
                }}
              />
            ) : (
              <div className="loading">규칙 엔진 불러오는 중…</div>
            )}
          </div>
          {player(bottom)}
        </div>
      </div>

      <aside className="panel">
        <header className="panel-head">
          <span className="panel-title">대국</span>
          <span className="me">
            {me && (
              <>
                {tagged(me)} · {me.rating}
                {me.provisional ? '?' : ''}
              </>
            )}
            <button
              className="link light"
              onClick={() => {
                api('/logout', token, {}).catch(() => {})
                saveToken(null)
                setToken(null)
                setMe(null)
                setGame(null)
              }}
            >
              로그아웃
            </button>
          </span>
        </header>
        {!connected && <div className="conn-warn">서버에 연결하는 중…</div>}
        {notice && (
          <div className="notice" onClick={() => setNotice(null)}>
            {notice}
          </div>
        )}

        {game && game.phase.startsWith("setup") && mySide && (
          <SetupPhase game={game} mySide={mySide} send={send} onHover={setHoverSetup} />
        )}

        {inGame || game?.phase === 'over' ? (
          <MoveList
            result={game?.phase === "over" && game.result ? resultLabel(game.result, game.reason) : null}
            tree={tree}
            current={shownPly === 0 ? 0 : shownPly}
            classes={new Map()}
            onSelect={(id) => setViewPly(id)}
            emptyText={game?.phase === 'play' ? '초가 먼저 둬요.' : '차림을 고르면 대국이 시작돼요.'}
          />
        ) : (
          <Lobby
            token={token}
            onMe={setMe}
            queue={queue}
            connected={connected}
            onQueue={() => send({ t: 'queue' })}
            onCancel={() => send({ t: 'unqueue' })}
            history={history}
            me={me}
            onOpen={async (id) => onReview(await loadGameImport(id))}
          />
        )}

        {game?.phase === 'over' && (
          <div className="result-box">
            <div className="result-title">
              {game.result === '1/2-1/2' ? '무승부' : `${game.result === '1-0' ? '초' : '한'} 승`} · {game.reason}
            </div>
            {mySide && game.delta && (
              <div className={`result-delta ${game.delta[mySide] >= 0 ? 'up' : 'down'}`}>
                레이팅 {game[mySide].rating} ({game.delta[mySide] >= 0 ? '+' : ''}
                {Math.round(game.delta[mySide])})
              </div>
            )}
            <div className="result-actions">
              <button
                className="btn primary"
                onClick={() =>
                  onReview({
                    key: game.id,
                    startFen: game.startFen ?? startFen('마상상마', '마상상마'),
                    moves: plies,
                    cho: tagged(game.cho),
                    han: tagged(game.han),
                    review: true,
                    result: game.result,
                    reason: game.reason,
                  })
                }
              >
                게임 리뷰
              </button>
              <button
                className="btn"
                onClick={() => {
                  setGame(null)
                  send({ t: 'queue' })
                }}
              >
                새 대국
              </button>
              <button className="btn" onClick={() => setGame(null)}>
                로비
              </button>
            </div>
          </div>
        )}

        {game?.phase === 'play' && mySide && (
          <>
            {game.drawOffer && game.drawOffer !== mySide && (
              <div className="draw-offer">
                상대가 무승부를 제안했어요
                <button className="btn primary" onClick={() => send({ t: 'draw', game: game.id, action: 'accept' })}>
                  수락
                </button>
                <button className="btn" onClick={() => send({ t: 'draw', game: game.id, action: 'decline' })}>
                  거절
                </button>
              </div>
            )}
            <footer className="controls">
              <button title="처음" onClick={() => setViewPly(0)}>
                <IconFirst />
              </button>
              <button title="이전 (←)" onClick={() => setViewPly(Math.max(0, shownPly - 1))}>
                <IconPrev />
              </button>
              <button title="다음 (→)" onClick={() => setViewPly(Math.min(plies.length, shownPly + 1))}>
                <IconNext />
              </button>
              <button title="현재" onClick={() => setViewPly(null)}>
                <IconLast />
              </button>
            </footer>
            <div className="actions">
              <button className="btn" disabled={!passMove} onClick={() => passMove && send({ t: 'move', game: game.id, uci: passMove })}>
                한수쉼
              </button>
              <button
                className="btn"
                disabled={!!game.drawOffer}
                onClick={() => send({ t: 'draw', game: game.id, action: 'offer' })}
              >
                {game.drawOffer === mySide ? '무승부 제안함' : '무승부 제안'}
              </button>
              <button
                className="btn danger"
                onClick={() => confirm('기권할까요?') && send({ t: 'resign', game: game.id })}
              >
                기권
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}

/** Before setups are chosen, show the board with what has been picked (or hovered) so far. */
function previewFen(game: GameView | null, mySide: Side | null, hover: Setup | null) {
  const pick = (side: Side) => (side === mySide && hover) || (game?.setups[side] as Setup | undefined) || '마상상마'
  return startFen(pick('cho'), pick('han'))
}

function SetupPhase({
  game,
  mySide,
  send,
  onHover,
}: {
  game: GameView & { receivedAt: number }
  mySide: Side
  send: (m: Record<string, unknown>) => void
  onHover: (s: Setup | null) => void
}) {
  const turn: Side = game.phase === 'setup-han' ? 'han' : 'cho'
  const left = Math.max(0, (game.deadline ?? 0) - (Date.now() - game.receivedAt))
  const opp: Side = mySide === 'cho' ? 'han' : 'cho'
  const oppSetup = game.setups[opp] as Setup | undefined
  return (
    <div className="setup-phase">
      {oppSetup && (
        <div className="opp-setup">
          <span>상대({SIDE_NAME[opp]}) 차림</span>
          <SetupIcon setup={oppSetup} side={opp} mirror />
        </div>
      )}
      {turn !== mySide ? (
        <div className="setup-wait">
          {SUBJECT[turn]} 차림을 고르는 중… <span className="muted">{formatClock(left)}</span>
          <div className="muted small">나는 {IS[mySide]}.</div>
        </div>
      ) : (
        <div className="setup-pick">
          <div>
            내 차림을 골라 주세요 ({SIDE_NAME[mySide]}) <span className="muted">{formatClock(left)}</span>
          </div>
          <SetupPicker
            side={mySide}
            onHover={onHover}
            onPick={(s) => {
              onHover(null)
              send({ t: 'setup', game: game.id, setup: s })
            }}
          />
          <div className="muted small">내 쪽에서 본 모습이에요. 올려 보면 판에 미리 보여요. 시간이 지나면 마상상마로 정해져요.</div>
        </div>
      )}
    </div>
  )
}

function Lobby({
  token,
  onMe,
  queue,
  connected,
  onQueue,
  onCancel,
  history,
  me,
  onOpen,
}: {
  token: string
  onMe: (u: PublicUser) => void
  queue: { waiting: boolean; count: number }
  connected: boolean
  onQueue: () => void
  onCancel: () => void
  history: GameSummary[]
  me: PublicUser | null
  onOpen: (id: string) => void
}) {
  return (
    <div className="lobby">
      {me && <ProfileCard me={me} token={token} onChange={onMe} />}
      <div className="seek-card">
        <div className="seek-info">
          <span className="seek-tc">10분 + 5초</span>
          <span className="muted small">레이팅 대국 · 초/한 무작위</span>
        </div>
        {queue.waiting ? (
          <div className="seeking">
            <div className="spinner" />
            <span>
              상대를 찾는 중 <span className="muted">· 대기 {queue.count}명</span>
            </span>
            <button className="btn ghost" onClick={onCancel}>
              취소
            </button>
          </div>
        ) : (
          <button className="btn primary seek-btn" disabled={!connected} onClick={onQueue}>
            대국 찾기
          </button>
        )}
      </div>
      <div className="lobby-title">내 대국</div>
      <div className="lobby-list">
        {history.length === 0 ? (
          <div className="muted pad">아직 둔 대국이 없어요.</div>
        ) : (
          me && history.map((g) => <GameRow key={g.id} g={g} userId={me.id} onOpen={onOpen} />)
        )}
      </div>
    </div>
  )
}

function Login({ onLogin }: { onLogin: (token: string, user: PublicUser, created: boolean) => void }) {
  const [nick, setNick] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await api<{ token: string; user: PublicUser; created: boolean }>('/login', null, { nick: nick.trim(), password })
      onLogin(r.token, r.user, r.created)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="login-wrap">
      <form className="login" onSubmit={submit}>
        <h2>대국하기</h2>
        <p className="muted small">
          닉네임과 비밀번호 조합이 곧 계정이에요. 처음 쓰는 조합이면 새 계정이 만들어지고, 닉네임 뒤에 <b>#태그</b>가 붙어요.
          비밀번호를 다르게 치면 다른 계정이 되니 주의하세요.
        </p>
        <label>
          닉네임
          <input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={12} autoComplete="username" />
        </label>
        <label>
          비밀번호
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn primary big" disabled={busy || !nick || !password}>
          입장
        </button>
      </form>
    </div>
  )
}

/** Center-crops and shrinks a picture to 128×128 in the browser before uploading. */
async function toAvatarDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file)
  const s = Math.min(bmp.width, bmp.height)
  const c = document.createElement('canvas')
  c.width = c.height = 128
  c.getContext('2d')!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 128, 128)
  const webp = c.toDataURL('image/webp', 0.85)
  return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/jpeg', 0.85) // Safari has no WebP encoder
}

function ProfileCard({ me, token, onChange }: { me: PublicUser; token: string; onChange: (u: PublicUser) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const upload = async (image: string | null) => {
    setError(null)
    try {
      const r = await api<{ user: PublicUser }>('/avatar', token, { image })
      onChange(r.user)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <div className="profile-card">
      <button className="profile-photo" title="프로필 사진 바꾸기" onClick={() => input.current?.click()}>
        <Avatar side="cho" src={me.avatar} size={56} />
        <span className="profile-edit">변경</span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) upload(await toAvatarDataUrl(f).catch(() => '')).catch(() => {})
        }}
      />
      <div className="profile-text">
        <div className="profile-name">
          {me.nick}
          <span className="muted">#{me.tag}</span>
        </div>
        <div className="muted small">
          레이팅 {me.rating}
          {me.provisional ? '?' : ''} · {me.games}판
        </div>
        {me.avatar && (
          <button className="link light small" onClick={() => upload(null)}>
            사진 지우기
          </button>
        )}
        {error && <div className="error">{error}</div>}
      </div>
    </div>
  )
}
