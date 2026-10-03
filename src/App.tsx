import { useEffect, useState } from 'react'
import Analysis, { type GameImport } from './Analysis'
import Play from "./Play"
import Ranking from "./Ranking"
import { usePresence } from "./presence"
import { loadRules } from './janggi'
import { IconAnalysis, IconPlay, IconRanking } from "./ui"

type Page = "play" | "analysis" | "ranking"
const pageFromHash = (): Page => (location.hash === "#analysis" ? "analysis" : location.hash === "#ranking" ? "ranking" : "play")

export default function App() {
  const [rulesReady, setRulesReady] = useState(false)
  const [page, setPage] = useState<Page>(pageFromHash)
  const [load, setLoad] = useState<GameImport | null>(null)
  const presence = usePresence()
  const [seek, setSeek] = useState(0) // bumped to make the play page join the queue

  useEffect(() => {
    loadRules().then(() => setRulesReady(true))
    const onHash = () => setPage(pageFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (p: Page) => {
    location.hash = p
    setPage(p)
  }

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="logo">楚漢</div>
        <button className={page === 'play' ? 'active' : ''} onClick={() => go('play')}>
          <IconPlay />
          <span>대국</span>
        </button>
        <button className={page === 'analysis' ? 'active' : ''} onClick={() => go('analysis')}>
          <IconAnalysis />
          <span>분석</span>
        </button>
        <button className={page === "ranking" ? "active" : ""} onClick={() => go("ranking")}>
          <IconRanking />
          <span>순위</span>
        </button>
        {presence && (
          <div
            className="online"
            title={`로그인 ${presence.loggedIn}명 · 대국 중 ${presence.playing}판 · 대기 ${presence.queue}명`}
          >
            <span className="online-dot" />
            <b>{presence.online}</b>
            <span>명 접속</span>
          </div>
        )}
      </nav>
      <main className="page" hidden={page !== 'play'}>
        <Play
          rulesReady={rulesReady}
          presence={presence}
          seek={seek}
          active={page === 'play'}
          onReview={(g) => {
            setLoad(g)
            go('analysis')
          }}
        />
      </main>
      <main className="page" hidden={page !== "ranking"}>
        <Ranking
          active={page === "ranking"}
          onReview={(g) => {
            setLoad(g)
            go("analysis")
          }}
        />
      </main>
      <main className="page" hidden={page !== 'analysis'}>
        <Analysis
          rulesReady={rulesReady}
          active={page === "analysis"}
          load={load}
          onNewGame={() => {
            setSeek((s) => s + 1)
            go("play")
          }}
        />
      </main>
    </div>
  )
}
