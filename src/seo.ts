// Site and page metadata. Used by the app (document titles) and by scripts/seo.ts at build time,
// which writes one pre-rendered HTML file per page plus sitemap.xml. New content pages (e.g. openings)
// only need an entry here.
import { LICENSES_PAGE, NOTATION_PAGE, PRIVACY_PAGE } from './docs.ts'

export const SITE = {
  name: '초한 장기',
  url: 'https://myunsyeya.com',
  locale: 'ko_KR',
  language: 'ko-KR',
  image: '/og.png', // 1200×630
  themeColor: '#302e2b',
  // descriptions stay under 80 characters (Naver Search Advisor recommendation)
  description: '무료 온라인 장기. 레이팅 대국과 AI 엔진 분석, 수마다 탁월한 수·실수를 짚어 주는 게임 리뷰까지 브라우저에서 바로.',
}

export interface PageMeta {
  path: string // canonical path, no trailing slash ("/" for home)
  title: string
  description: string
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority: number
  /** Short static content for crawlers that do not run JavaScript (HTML, shown until the app loads). */
  body: string
  /** Link-preview image (path from the site root); the site's og.png when missing */
  image?: string
  /** og:type; 'website' when missing ('article' for study chapters) */
  ogType?: 'website' | 'article'
  /** A document page: the app shows `body` itself (licenses, policies, articles such as opening guides). */
  doc?: boolean
}

export const PAGES: PageMeta[] = [
  {
    path: '/',
    title: '초한 장기 — 온라인 장기 대국과 AI 기보 분석',
    description: SITE.description,
    changefreq: 'weekly',
    priority: 1,
    body: `
<h1>초한 장기 — 온라인 장기 대국과 AI 기보 분석</h1>
<p>초한 장기는 브라우저에서 바로 두는 무료 온라인 장기 사이트예요. 닉네임과 식별번호만으로, 또는 게스트로 바로 시작하고, 대기 중인 상대와 자동으로 매칭되어 10분 + 수당 5초 레이팅 대국을 둡니다.</p>
<ul>
  <li><b>온라인 대국</b>: 자동 매칭, 초·한 무작위 배정, 차림(마상상마 등) 선택, 프리무브, Glicko-2 레이팅</li>
  <li><b>분석판</b>: Fairy-Stockfish NNUE 엔진이 수마다 형세 점수와 후보 수순을 보여줌, 변화도와 화살표 그리기</li>
  <li><b>게임 리뷰</b>: 모든 수를 탁월한 수·훌륭한 수·최선의 수·부정확한 수·실수·블런더로 평가하고 정확도와 평가 그래프 제공</li>
  <li><b>순위</b>: 레이팅 순위와 플레이어별 승·무·패 전적 조회</li>
</ul>
<p>규칙은 카카오 장기와 같은 현대 규칙(빅장 없음, 점수 계산, 한 덤 1.5점)을 따릅니다. 양쪽이 연달아 한수쉼하거나, 한쪽 기물 점수가 10점 이하가 되거나, 200수가 되면 점수가 높은 쪽이 이깁니다. 같은 국면을 세 번째로 만드는 수는 둘 수 없습니다(양쪽 모두 30점 미만이면 허용).</p>
<nav><a href="/analysis">장기 분석판</a> · <a href="/ranking">장기 순위</a></nav>`,
  },
  {
    path: '/analysis',
    title: '장기 분석판 — AI 엔진으로 형세와 최선의 수 보기 | 초한 장기',
    description: '장기판에 수를 두면 AI 엔진이 형세 점수와 최선의 수순을 바로 보여주는 무료 장기 분석판. 게임 리뷰와 정확도까지.',
    changefreq: 'monthly',
    priority: 0.8,
    body: `
<h1>장기 분석판</h1>
<p>장기판에 직접 수를 두면 Fairy-Stockfish NNUE 엔진이 그 자리에서 다시 분석해 형세 점수(평가 막대)와 최선의 수순 3개를 보여줘요. 엔진 수순의 수에 마우스를 올리면 그 국면을 미리 볼 수 있고, 누르면 변화도로 남습니다.</p>
<p>게임 리뷰 탭에서는 기보의 모든 수를 chess.com과 같은 기준(탁월한 수, 훌륭한 수, 최선의 수, 뛰어난 수, 좋은 수, 부정확한 수, 실수, 놓친 수, 블런더)으로 평가하고, 초·한의 정확도와 평가 그래프를 보여줍니다.</p>
<nav><a href="/">온라인 대국</a> · <a href="/ranking">장기 순위</a> · <a href="/notation">기보 표기법</a></nav>`,
  },
  {
    path: '/ranking',
    title: '장기 레이팅 순위·전적 조회 | 초한 장기',
    description: '초한 장기 레이팅 순위와 플레이어별 승·무·패, 승률, 최근 대국 전적을 조회해 보세요.',
    changefreq: 'daily',
    priority: 0.6,
    body: `
<h1>장기 레이팅 순위</h1>
<p>초한 장기의 레이팅 대국 결과로 매겨지는 Glicko-2 순위예요. 닉네임으로 플레이어를 찾아 승·무·패, 승률, 최근 대국을 볼 수 있고, 대국을 누르면 AI 게임 리뷰로 열립니다.</p>
<nav><a href="/">온라인 대국</a> · <a href="/analysis">장기 분석판</a></nav>`,
  },
  {
    path: '/records',
    title: '장기 대회 기보와 AI 게임 리뷰 | 초한 장기',
    description: '장기 대회와 방송 대국의 기보를 모아 AI 게임 리뷰(우세 그래프, 수마다 탁월·실수 판정)로 봐요. 누구나 기보를 올릴 수 있어요.',
    changefreq: 'daily',
    priority: 0.6,
    body: `
<h1>장기 대회 기보</h1>
<p>대회와 방송에서 둔 장기 기보를 누구나 올리고, Fairy-Stockfish 엔진의 게임 리뷰(우세 그래프, 수마다 탁월·좋은 수·실수·블런더 판정)로 함께 봐요. 올라온 기보는 연구자가 차례로 받아 전환점과 더 나은 수순을 장기 연구로 써요.</p>
<nav><a href="/analysis">장기 분석판</a> · <a href="/study">장기 연구</a> · <a href="/notation">기보 표기법</a></nav>`,
  },
  NOTATION_PAGE,
  LICENSES_PAGE,
  PRIVACY_PAGE,
]

export const pageFor = (path: string) => PAGES.find((p) => p.path === path)
