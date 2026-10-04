import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import Analysis, { type GameImport } from './Analysis'
import Play from './Play'
import Ranking from './Ranking'
import Records from './Records'
import { loadRecordImport } from './recordData'
import StudyList from './StudyList'
import StudyPage from './StudyPage'
import StudyEditor from './StudyEditor'
import { syncHead } from './headSync'
import { usePresence } from './presence'
import { loadRules } from './janggi'
import { PAGES, pageFor } from './seo'
import { SETUPS, replay, startFen, withBoard, type Setup } from './janggi'
import { IconAnalysis, IconLearn, IconPlay, IconRanking, IconReview } from './ui'

type AppPage = 'play' | 'analysis' | 'ranking' | 'records'
const APP_PAGES: Partial<Record<string, AppPage>> = { '/': 'play', '/analysis': 'analysis', '/ranking': 'ranking', '/records': 'records' }
const DOC_PATHS = new Set(PAGES.filter((p) => p.doc).map((p) => p.path))
// /study, /study/mine, /study/topic/<topic>, /study/<id>, /study/<id>/<chapter>, /study/<id>/edit
function studyRoute(path: string) {
  if (path === '/study') return { list: true as const, topic: null, mine: false }
  if (path === '/study/mine') return { list: true as const, topic: null, mine: true }
  const t = /^\/study\/topic\/([^/]+)$/.exec(path)
  if (t) return { list: true as const, topic: t[1], mine: false }
  const m = /^\/study\/([a-z0-9-]+)(?:\/([\w-]+))?$/.exec(path)
  if (m) return { list: false as const, id: m[1], chapter: m[2] === 'edit' ? null : (m[2] ?? null), edit: m[2] === 'edit' }
  return null
}
const known = (path: string) => path in APP_PAGES || DOC_PATHS.has(path) || !!studyRoute(path)

function pathFromLocation(): string {
  // old links used #analysis / #ranking
  const legacy = '/' + location.hash.slice(1)
  if (location.hash && (legacy === '/analysis' || legacy === '/ranking')) {
    history.replaceState(null, '', legacy)
    return legacy
  }
  if (location.hash === '#play') history.replaceState(null, '', '/')
  if (known(location.pathname)) return location.pathname
  history.replaceState(null, '', '/') // unknown address (served as a 404 page): show the home page
  return '/'
}

/** /analysis?cho=상마상마&han=마상마상&moves=h1g3,h3e3 → that line on the analysis board (used by learning pages). */
function lineFromUrl(url: URL): GameImport | null {
  const moves = url.searchParams.get('moves')
  if (url.pathname !== '/analysis' || !moves) return null
  const setup = (v: string | null): Setup => (SETUPS as readonly string[]).includes(v ?? '') ? (v as Setup) : '마상상마'
  const fen = startFen(setup(url.searchParams.get('cho')), setup(url.searchParams.get('han')))
  const ucis = moves.split(',').filter(Boolean)
  // keep only the legal prefix
  const legal = withBoard(fen, (b) => {
    const ok: string[] = []
    for (const u of ucis) {
      if (!b.legalMoves().split(' ').includes(u)) break
      b.push(u)
      ok.push(u)
    }
    return ok
  })
  return { key: url.search, startFen: fen, moves: replay(fen, legal) }
}

/** /analysis?record=r-… → that tournament record's id */
function recordFromUrl(url: URL) {
  const id = url.searchParams.get('record')
  return url.pathname === '/analysis' && id && /^r-[a-z0-9]{8}$/.test(id) ? id : null
}

export default function App() {
  const [rulesReady, setRulesReady] = useState(false)
  const [path, setPath] = useState(pathFromLocation)
  const [search, setSearch] = useState(() => location.search) // study pages: ?moves=… opens that position
  const [load, setLoad] = useState<GameImport | null>(null)
  const presence = usePresence()
  const [seek, setSeek] = useState(0) // bumped to make the play page join the queue
  const study = studyRoute(path)
  const page: AppPage | 'doc' | 'study' = APP_PAGES[path] ?? (study ? 'study' : 'doc')

  useEffect(() => {
    loadRules().then(() => {
      setRulesReady(true)
      const url = new URL(location.href)
      const line = lineFromUrl(url)
      if (line) setLoad(line)
      const rec = recordFromUrl(url)
      if (rec) openRecord(rec, false)
    })
    const onPop = () => {
      setPath(pathFromLocation())
      setSearch(location.search)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    void syncHead(path)
  }, [path])

  useEffect(() => {
    const meta = pageFor(path)
    if (meta) document.title = meta.title
    if (page === 'doc' || page === 'study') window.scrollTo(0, 0)
  }, [path, page])

  const go = (to: string, query = '') => {
    if (location.pathname + location.search !== to + query) history.pushState(null, '', to + query)
    setPath(to)
    setSearch(query)
  }

  /** A tournament record in the game review (/analysis?record=…) */
  const openRecord = (id: string, push = true) => {
    loadRecordImport(id).then(
      (g) => {
        setLoad(g)
        if (push) go('/analysis', `?record=${id}`)
      },
      (e) => alert((e as Error).message),
    )
  }

  /** In-app navigation for plain clicks on links to our own pages; other clicks behave normally. */
  const followLink = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a')
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    const url = new URL(a.href, location.href)
    if (url.origin !== location.origin || !known(url.pathname)) return
    e.preventDefault()
    const line = rulesReady ? lineFromUrl(url) : null
    if (line) setLoad(line)
    const rec = rulesReady ? recordFromUrl(url) : null
    if (rec) return openRecord(rec)
    go(url.pathname, studyRoute(url.pathname) ? url.search : '')
  }

  const NavLink = ({ to, children, className = '' }: { to: string; children: ReactNode; className?: string }) => (
    <a href={to} className={`${className} ${path === to ? 'active' : ''}`}>
      {children}
    </a>
  )

  const doc = page === 'doc' ? pageFor(path) : undefined

  return (
    <div className="shell" onClick={followLink}>
      <nav className="sidebar">
        <div className="logo">楚漢</div>
        <NavLink to="/">
          <IconPlay />
          <span>대국</span>
        </NavLink>
        <NavLink to="/analysis">
          <IconAnalysis />
          <span>분석</span>
        </NavLink>
        <NavLink to="/ranking">
          <IconRanking />
          <span>순위</span>
        </NavLink>
        <NavLink to="/study" className={page === 'study' ? 'active' : ''}>
          <IconLearn />
          <span>학습</span>
        </NavLink>
        <NavLink to="/records">
          <IconReview />
          <span>기보</span>
        </NavLink>
        <div className="sidebar-foot">
          <NavLink to="/notation" className="foot-link">
            표기법
          </NavLink>
          <NavLink to="/licenses" className="foot-link">
            라이선스
          </NavLink>
          <NavLink to="/privacy" className="foot-link">
            개인정보
          </NavLink>
        </div>
      </nav>
      <main className="page" hidden={page !== 'play'}>
        <Play
          rulesReady={rulesReady}
          presence={presence}
          seek={seek}
          active={page === 'play'}
          onReview={(g) => {
            setLoad(g)
            go('/analysis')
          }}
        />
      </main>
      <main className="page" hidden={page !== 'ranking'}>
        <Ranking
          active={page === 'ranking'}
          onReview={(g) => {
            setLoad(g)
            go('/analysis')
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
            go('/')
          }}
          onRecord={openRecord}
        />
      </main>
      <main className="page" hidden={page !== 'records'}>
        <Records active={page === 'records'} onOpen={openRecord} />
      </main>
      {study?.list && (
        <main className="page">
          <StudyList topicSlug={study.topic} mine={study.mine} active />
        </main>
      )}
      {study && !study.list && study.edit && (
        <main className="page">
          <StudyEditor id={study.id} active rulesReady={rulesReady} />
        </main>
      )}
      {study && !study.list && !study.edit && (
        <main className="page">
          <StudyPage id={study.id} chapterId={study.chapter} at={new URLSearchParams(search).get('moves')} active rulesReady={rulesReady} />
        </main>
      )}
      {doc && (
        <main className="page">
          {/* our own static HTML from src/docs.ts */}
          <article className="doc" dangerouslySetInnerHTML={{ __html: doc.body }} />
        </main>
      )}
    </div>
  )
}
