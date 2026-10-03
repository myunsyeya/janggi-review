// Post-build: one pre-rendered HTML file per page (meta tags, JSON-LD, crawlable body) and sitemap.xml.
// Run by `npm run build` after `vite build`. Caddy serves /foo from dist/foo.html.
import fs from 'node:fs'
import path from 'node:path'
import { PAGES, SITE, type PageMeta } from '../src/seo.ts'

const DIST = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'dist')
const template = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8')
if (!template.includes('<!--seo-head-->') || !template.includes('<!--seo-body-->')) throw new Error('index.html is missing the seo placeholders')

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const abs = (p: string) => SITE.url + (p === '/' ? '/' : p)

function jsonLd(page: PageMeta) {
  const website = {
    '@type': 'WebSite',
    '@id': `${SITE.url}/#website`,
    name: SITE.name,
    url: `${SITE.url}/`,
    inLanguage: SITE.language,
    description: SITE.description,
  }
  const app = {
    '@type': 'WebApplication',
    '@id': `${SITE.url}/#app`,
    name: SITE.name,
    url: `${SITE.url}/`,
    applicationCategory: 'GameApplication',
    applicationSubCategory: '장기 (Janggi, Korean chess)',
    operatingSystem: 'Web browser',
    inLanguage: SITE.language,
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'KRW' },
    description: SITE.description,
    image: SITE.url + SITE.image,
    featureList: [
      '온라인 레이팅 대국과 자동 매칭',
      'Fairy-Stockfish NNUE 엔진 실시간 분석',
      '수마다 등급을 매기는 게임 리뷰와 정확도',
      '변화도, 화살표, 프리무브',
      'Glicko-2 레이팅 순위와 전적 조회',
    ],
  }
  const webpage = {
    '@type': 'WebPage',
    '@id': `${abs(page.path)}#webpage`,
    url: abs(page.path),
    name: page.title,
    description: page.description,
    inLanguage: SITE.language,
    isPartOf: { '@id': `${SITE.url}/#website` },
    about: { '@id': `${SITE.url}/#app` },
    primaryImageOfPage: SITE.url + SITE.image,
  }
  const graph: object[] = [website, app, webpage]
  if (page.path !== '/') {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE.name, item: `${SITE.url}/` },
        { '@type': 'ListItem', position: 2, name: page.title.split(' | ')[0].split(' — ')[0], item: abs(page.path) },
      ],
    })
  }
  // "</" must not appear inside the script element
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')
}

function head(page: PageMeta) {
  const url = abs(page.path)
  const image = SITE.url + SITE.image
  return [
    `<meta name="description" content="${esc(page.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta name="robots" content="index, follow, max-image-preview:large" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(SITE.name)}" />`,
    `<meta property="og:locale" content="${SITE.locale}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(SITE.name)} 장기판" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(page.title)}" />`,
    `<meta name="twitter:description" content="${esc(page.description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    `<script type="application/ld+json">${jsonLd(page)}</script>`,
  ].join('\n    ')
}

for (const page of PAGES) {
  const html = template
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(page.title)}</title>`)
    .replace('<!--seo-head-->', head(page))
    .replace('<!--seo-body-->', `<main class="seo-fallback">${page.body.trim()}</main>`)
  const file = page.path === '/' ? 'index.html' : `${page.path.slice(1)}.html`
  fs.mkdirSync(path.dirname(path.join(DIST, file)), { recursive: true })
  fs.writeFileSync(path.join(DIST, file), html)
  console.log('seo:', file)
}

const lastmod = new Date().toISOString()
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${PAGES.map(
  (p) => `  <url>
    <loc>${abs(p.path)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority.toFixed(1)}</priority>${
      p.path === '/'
        ? `
    <image:image><image:loc>${SITE.url + SITE.image}</image:loc></image:image>`
        : ''
    }
  </url>`,
).join('\n')}
</urlset>
`
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap)
console.log('seo: sitemap.xml', PAGES.length, 'urls')

// 404 page: same app shell (the app shows the play page), but marked noindex
const notFound = template
  .replace(/<title>[^<]*<\/title>/, `<title>페이지를 찾을 수 없어요 | ${esc(SITE.name)}</title>`)
  .replace('<!--seo-head-->', '<meta name="robots" content="noindex" />')
  .replace(
    '<!--seo-body-->',
    `<main class="seo-fallback"><h1>페이지를 찾을 수 없어요</h1><p><a href="/">초한 장기 첫 화면으로</a></p></main>`,
  )
fs.writeFileSync(path.join(DIST, '404.html'), notFound)
console.log('seo: 404.html')

// guard: search engines (Naver in particular) cut descriptions longer than 80 characters
for (const p of PAGES) if ([...p.description].length > 80) throw new Error(`description over 80 chars: ${p.path}`)
