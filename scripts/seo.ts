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

/** Extra structured data for generated pages: breadcrumb trail, page type and nodes such as an Article. */
type Extra = { crumbs?: { name: string; path: string }[]; pageType?: string; about?: string; nodes?: object[] }

function jsonLd(page: PageMeta, extra: Extra = {}) {
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
    '@type': extra.pageType ?? 'WebPage',
    '@id': `${abs(page.path)}#webpage`,
    url: abs(page.path),
    name: page.title,
    description: page.description,
    inLanguage: SITE.language,
    isPartOf: { '@id': `${SITE.url}/#website` },
    about: { '@id': extra.about ?? `${SITE.url}/#app` },
    primaryImageOfPage: SITE.url + (page.image ?? SITE.image),
  }
  const graph: object[] = [website, app, webpage, ...(extra.nodes ?? [])]
  if (extra.crumbs) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: extra.crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: abs(c.path) })),
    })
  } else if (page.path !== '/') {
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

function head(page: PageMeta, extra?: Extra) {
  const url = abs(page.path)
  const image = SITE.url + (page.image ?? SITE.image)
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
    `<meta property="og:image:alt" content="${esc(page.image ? page.title.split(' | ')[0] : SITE.name + ' 장기판')}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(page.title)}" />`,
    `<meta name="twitter:description" content="${esc(page.description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    `<script type="application/ld+json">${jsonLd(page, extra)}</script>`,
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

// --- studies: list, topic and chapter pages (research notes compiled by scripts/studies.ts) ------------------
import type { StudyChapter, StudyNode } from '../src/studyFormat.ts'
type StudyFile = { id: string; title: string; topics: string[]; description: string; author?: string; created: string; updated: string; chapters: StudyChapter[] }
const studyDir = path.join(DIST, 'studies')
const studyIndex: { id: string; title: string; topics: string[]; description: string; updated: string; chapters: { id: string; name: string }[] }[] =
  fs.existsSync(path.join(studyDir, 'index.json')) ? JSON.parse(fs.readFileSync(path.join(studyDir, 'index.json'), 'utf8')) : []
const studyUrls: { loc: string; lastmod: string; priority: number }[] = []
const llmsLines: string[] = []
const topicSlugs: Record<string, string> = fs.existsSync(path.join(studyDir, 'topics.json'))
  ? JSON.parse(fs.readFileSync(path.join(studyDir, 'topics.json'), 'utf8'))
  : {}
const NOTATION_NOTE = `<p>기보는 이 사이트의 표기법으로 적었어요(H 마, E 상, C 포, R 차, K 궁, A 사, 졸·병은 글자 없음, 줄 a~i·선 1~10). + 평가는 초에게 유리하다는 뜻이에요. <a href="/notation">기보 표기법 보기</a></p>`

function writePage(file: string, page: PageMeta, extra?: Extra) {
  const html = template
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(page.title)}</title>`)
    .replace('<!--seo-head-->', head(page, extra))
    .replace('<!--seo-body-->', `<main class="seo-fallback">${page.body.trim()}</main>`)
  fs.mkdirSync(path.dirname(path.join(DIST, file)), { recursive: true })
  fs.writeFileSync(path.join(DIST, file), html)
}
const short = (s: string) => ([...s].length > 80 ? [...s].slice(0, 79).join('') + '…' : s)

/**
 * Moves and comments as readable HTML: the main line in paragraphs (a new paragraph wherever there is a comment),
 * the alternatives to a move as a list right after it, deeper variations inline in parentheses.
 */
function chapterHtml(root: StudyNode) {
  const label = (ply: number, n: StudyNode) => `<b>${esc(`${Math.ceil(ply / 2)}${ply % 2 ? '.' : '...'} ${n.san ?? ''}${(n.glyphs ?? []).join('')}`)}</b>`
  const inline = (start: StudyNode, ply: number): string => {
    let out = ''
    for (let n: StudyNode | undefined = start, p = ply; n; n = n.ch[0], p++) {
      out += ` ${label(p, n)}`
      if (n.comment) out += ` ${esc(n.comment)}`
      for (const alt of n.ch.slice(1)) out += ` (${inline(alt, p + 1)})`
    }
    return out.trim()
  }
  let html = root.comment ? `<p>${esc(root.comment)}</p>` : ''
  let para: string[] = []
  let parent = root
  for (let n: StudyNode | undefined = root.ch[0], p = 1; n; parent = n, n = n.ch[0], p++) {
    para.push(label(p, n))
    const alts = parent.ch.slice(1)
    if (n.comment || alts.length || !n.ch.length) {
      html += `<p>${para.join(' ')}${n.comment ? ' ' + esc(n.comment) : ''}</p>`
      para = []
      if (alts.length) html += `<ul>${alts.map((a) => `<li>변화: ${inline(a, p)}</li>`).join('')}</ul>`
    }
  }
  return html
}

if (studyIndex.length) {
  const listBody = (title: string, items: typeof studyIndex) =>
    `<h1>${esc(title)}</h1><ul>${items
      .map((s) => `<li><a href="/study/${s.id}">${esc(s.title)}</a> — ${esc(s.description)}<ol>${s.chapters.map((c) => `<li>${esc(c.name)}</li>`).join('')}</ol></li>`)
      .join('')}</ul>`
  writePage('study.html', {
    path: '/study',
    title: '장기 연구 — 포진과 변화 | 초한 장기',
    description: '귀마 대 귀마부터 시작하는 장기 포진 연구 노트. 변화도와 해설을 판 위에서 한 수씩 따라가요.',
    changefreq: 'weekly',
    priority: 0.8,
    body: listBody('장기 연구', studyIndex),
  }, {
    pageType: 'CollectionPage',
    crumbs: [{ name: SITE.name, path: '/' }, { name: '장기 연구', path: '/study' }],
  })
  studyUrls.push({ loc: '/study', lastmod: studyIndex.map((s) => s.updated).sort().at(-1)!, priority: 0.8 })
  for (const topic of new Set(studyIndex.flatMap((s) => s.topics))) {
    const items = studyIndex.filter((s) => s.topics.includes(topic))
    const slug = topicSlugs[topic]
    if (!slug) throw new Error(`no English path for topic ${topic}`)
    const p = `/study/topic/${slug}`
    writePage(`study/topic/${slug}.html`, {
      path: p,
      title: `${topic} — 장기 연구 | 초한 장기`,
      description: short(`${topic} 주제의 장기 연구 ${items.length}개: ${items.map((s) => s.title).join(', ')}`),
      changefreq: 'weekly',
      priority: 0.5,
      body: listBody(topic, items),
    }, {
      pageType: 'CollectionPage',
      crumbs: [{ name: SITE.name, path: '/' }, { name: '장기 연구', path: '/study' }, { name: topic, path: p }],
    })
    studyUrls.push({ loc: p, lastmod: items.map((s) => s.updated).sort().at(-1)!, priority: 0.5 })
  }
  for (const meta of studyIndex) {
    const study = JSON.parse(fs.readFileSync(path.join(studyDir, `${meta.id}.json`), 'utf8')) as StudyFile
    const studyPath = `/study/${study.id}`
    const chPath = (i: number) => (i === 0 ? studyPath : `${studyPath}/${study.chapters[i].id}`)
    study.chapters.forEach((ch, i) => {
      const p = chPath(i)
      const nav = `<nav>${study.chapters.map((c, j) => `<a href="${chPath(j)}">${j + 1}. ${esc(c.name)}</a>`).join(' · ')}</nav>`
      // the chapter's opening comment is its summary; the first chapter is also the study's page
      const summary = i === 0 ? study.description : (ch.root.comment ?? study.description).split('\n')[0]
      const topics = [...new Set([...study.topics.filter((t) => !study.chapters.some((c) => c.topics?.includes(t))), ...(ch.topics ?? [])])]
      const page: PageMeta = {
        path: p,
        title: `${study.title}: ${ch.name} | 초한 장기`,
        description: short(i === 0 ? summary : `${ch.name}. ${summary}`),
        changefreq: 'monthly',
        priority: 0.7,
        image: fs.existsSync(path.join(DIST, 'og/study', study.id, `${ch.id}.png`)) ? `/og/study/${study.id}/${ch.id}.png` : undefined,
        body: `<h1>${esc(study.title)}: ${esc(ch.name)}</h1>${NOTATION_NOTE}<h2>수순과 해설</h2>${chapterHtml(ch.root)}${nav}`,
      }
      writePage(i === 0 ? `study/${study.id}.html` : `study/${study.id}/${ch.id}.html`, page, {
        about: `${abs(p)}#article`,
        crumbs: [
          { name: SITE.name, path: '/' },
          { name: '장기 연구', path: '/study' },
          { name: study.title, path: studyPath },
          ...(i ? [{ name: ch.name, path: p }] : []),
        ],
        nodes: [
          { '@type': 'CreativeWorkSeries', '@id': `${abs(studyPath)}#study`, name: study.title, url: abs(studyPath), description: study.description, inLanguage: SITE.language },
          {
            '@type': 'Article',
            '@id': `${abs(p)}#article`,
            headline: `${study.title}: ${ch.name}`.slice(0, 110),
            description: page.description,
            inLanguage: SITE.language,
            url: abs(p),
            mainEntityOfPage: { '@id': `${abs(p)}#webpage` },
            isPartOf: { '@id': `${abs(studyPath)}#study` },
            position: i + 1,
            author: { '@type': 'Organization', name: study.author ?? SITE.name, url: `${SITE.url}/` },
            publisher: { '@type': 'Organization', name: SITE.name, url: `${SITE.url}/` },
            datePublished: study.created,
            dateModified: study.updated,
            image: SITE.url + (page.image ?? SITE.image),
            keywords: ['장기', 'Janggi', ...topics].join(', '),
            about: [{ '@type': 'Thing', name: '장기 포진 (Janggi opening)' }, ...topics.map((t) => ({ '@type': 'Thing', name: t }))],
          },
        ],
      })
      studyUrls.push({ loc: p, lastmod: study.updated, priority: 0.7 })
    })
    llmsLines.push(`- [${study.title}](${abs(studyPath)}): ${study.description}`)
    study.chapters.forEach((ch, i) =>
      llmsLines.push(`  - [${i + 1}. ${ch.name}](${abs(chPath(i))})${ch.root.comment ? ': ' + ch.root.comment.split('\n')[0] : ''}`),
    )
  }
  // the study list goes into llms.txt too, so AI crawlers see every chapter
  fs.appendFileSync(path.join(DIST, 'llms.txt'), `\n## 장기 연구\n\n${llmsLines.join('\n')}\n`)
  // append the study URLs to the sitemap
  const extra = studyUrls
    .map((u) => `  <url>\n    <loc>${SITE.url}${u.loc}</loc>\n    <lastmod>${new Date(u.lastmod).toISOString()}</lastmod>\n    <priority>${u.priority.toFixed(1)}</priority>\n  </url>`)
    .join('\n')
  const sm = path.join(DIST, 'sitemap.xml')
  fs.writeFileSync(sm, fs.readFileSync(sm, 'utf8').replace('</urlset>', `${extra}\n</urlset>`))
  console.log(`seo: ${studyUrls.length} study pages`)
}
