import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import Analysis, { type GameImport } from './Analysis'
import Play from './Play'
import Ranking from './Ranking'
import { usePresence } from './presence'
import { loadRules } from './janggi'
import { pageFor } from './seo'
import { IconAnalysis, IconPlay, IconRanking } from './ui'

type Page = 'play' | 'analysis' | 'ranking'
const PATHS: Record<Page, string> = { play: '/', analysis: '/analysis', ranking: '/ranking' }

function pageFromLocation(): Page {
  // old links used #analysis / #ranking
  const legacy = location.hash.slice(1)
  if (legacy === 'analysis' || legacy === 'ranking' || legacy === 'play') {
    history.replaceState(null, '', PATHS[legacy])
    return legacy
  }
  const found = (Object.keys(PATHS) as Page[]).find((p) => PATHS[p] === location.pathname)
  if (!found) history.replaceState(null, "", "/") // unknown address (served as a 404 page): show the home page
  return found ?? "play"
}

export default function App() {
  const [rulesReady, setRulesReady] = useState(false)
  const [page, setPage] = useState<Page>(pageFromLocation)
  const [load, setLoad] = useState<GameImport | null>(null)
  const presence = usePresence()
  const [seek, setSeek] = useState(0) // bumped to make the play page join the queue

  useEffect(() => {
    loadRules().then(() => setRulesReady(true))
    const onPop = () => setPage(pageFromLocation())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    const meta = pageFor(PATHS[page])
    if (meta) document.title = meta.title
  }, [page])

  const go = (p: Page) => {
    if (location.pathname !== PATHS[p]) history.pushState(null, '', PATHS[p])
    setPage(p)
  }

  // real links (crawlable, open in a new tab with a modifier key), handled in-app on a plain click
  const NavLink = ({ to, children }: { to: Page; children: ReactNode }) => (
    <a
      href={PATHS[to]}
      className={page === to ? 'active' : ''}
      onClick={(e: MouseEvent) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        go(to)
      }}
    >
      {children}
    </a>
  )

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="logo">楚漢</div>
        <NavLink to="play">
          <IconPlay />
          <span>대국</span>
        </NavLink>
        <NavLink to="analysis">
          <IconAnalysis />
          <span>분석</span>
        </NavLink>
        <NavLink to="ranking">
          <IconRanking />
          <span>순위</span>
        </NavLink>
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
      <main className="page" hidden={page !== 'ranking'}>
        <Ranking
          active={page === 'ranking'}
          onReview={(g) => {
            setLoad(g)
            go('analysis')
          }}
        />
      </main>
      <main className="page" hidden={page !== 'analysis'}>
        <Analysis
          rulesReady={rulesReady}
          active={page === 'analysis'}
          load={load}
          onNewGame={() => {
            setSeek((s) => s + 1)
            go('play')
          }}
        />
      </main>
    </div>
  )
}
