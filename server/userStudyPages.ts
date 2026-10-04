// Crawlable HTML for user studies (/study/u-…): the built app shell (dist/_shell.html) with the page's meta tags and
// the chapter as plain text, the same way scripts/seo.ts pre-renders the official studies. Studies with fewer than
// SEO_LIKES likes (and drafts, hidden or reported ones) are served with noindex. Also /sitemap-user-studies.xml.
import fs from 'node:fs'
import type http from 'node:http'
import path from 'node:path'
import { SITE } from '../src/seo.ts'
import { NOTATION_NOTE, chapterHtml, esc, gameHtml, gamePeople, short } from '../src/studyHtml.ts'
import { SEO_LIKES, getStudy, likesOf, listedStudies, viewStudy, type UserStudyDeps } from './userStudies.ts'

let shell: { mtime: number; html: string } | null = null
function template(dist: string) {
  const file = path.join(dist, '_shell.html') // written by scripts/seo.ts before it fills in index.html
  const mtime = fs.statSync(file).mtimeMs
  if (!shell || shell.mtime !== mtime) shell = { mtime, html: fs.readFileSync(file, 'utf8') }
  return shell.html
}

const abs = (p: string) => SITE.url + p

/** GET /study/u-xxxxxxxx[/chapter|/edit] → HTML; false if the path is not a user study */
export function handleUserStudyPage(d: UserStudyDeps, req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const m = /^\/study\/(u-[a-z0-9]{8})(?:\/([\w-]+))?$/.exec(url.pathname)
  if (!m || req.method !== 'GET') return false
  const r = getStudy(d, m[1])
  const view = r && viewStudy(d, r) // as an anonymous visitor sees it
  const chapter = view && (m[2] && m[2] !== 'edit' ? view.chapters.find((c) => c.id === m[2]) : view.chapters[0])
  let html = template(d.dist)
  if (!view || !chapter) {
    html = html
      .replace(/<title>[^<]*<\/title>/, `<title>연구를 찾을 수 없어요 | ${esc(SITE.name)}</title>`)
      .replace('<!--seo-head-->', '<meta name="robots" content="noindex" />')
      .replace('<!--seo-body-->', '<main class="seo-fallback"><h1>연구를 찾을 수 없어요</h1><p><a href="/study">장기 연구 목록</a></p></main>')
    res.writeHead(m[2] === 'edit' ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(html)
    return true
  }
  const i = view.chapters.indexOf(chapter)
  const pagePath = i === 0 ? `/study/${view.id}` : `/study/${view.id}/${chapter.id}`
  const indexable = m[2] !== 'edit' && likesOf(d.db, view.id) >= SEO_LIKES
  const title = `${view.title}: ${chapter.name} | ${SITE.name}`
  const summary = (i === 0 && view.description) || chapter.root.comment?.split('\n')[0] || view.description || `${view.author}의 장기 연구`
  const description = short(i === 0 ? summary : `${chapter.name}. ${summary}`)
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${abs(pagePath)}#article`,
        headline: `${view.title}: ${chapter.name}`.slice(0, 110),
        description,
        inLanguage: SITE.language,
        url: abs(pagePath),
        author: { '@type': 'Person', name: view.author },
        publisher: { '@type': 'Organization', name: SITE.name, url: `${SITE.url}/` },
        datePublished: view.created,
        dateModified: view.updated,
        image: SITE.url + SITE.image,
        keywords: ['장기', 'Janggi', ...view.topics, ...gamePeople(chapter.game)].join(', '),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: SITE.name, item: `${SITE.url}/` },
          { '@type': 'ListItem', position: 2, name: '장기 연구', item: abs('/study') },
          { '@type': 'ListItem', position: 3, name: view.title, item: abs(`/study/${view.id}`) },
          ...(i ? [{ '@type': 'ListItem', position: 4, name: chapter.name, item: abs(pagePath) }] : []),
        ],
      },
    ],
  }
  const head = [
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${abs(pagePath)}" />`,
    `<meta name="robots" content="${indexable ? 'index, follow' : 'noindex, follow'}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="${esc(SITE.name)}" />`,
    `<meta property="og:locale" content="${SITE.locale}" />`,
    `<meta property="og:url" content="${abs(pagePath)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:image" content="${SITE.url + SITE.image}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
  ].join('\n    ')
  const nav = `<nav>${view.chapters
    .map((c, j) => `<a href="${j === 0 ? `/study/${view.id}` : `/study/${view.id}/${c.id}`}">${j + 1}. ${esc(c.name)}</a>`)
    .join(' · ')}</nav>`
  const body = `<h1>${esc(view.title)}: ${esc(chapter.name)}</h1><p>${esc(view.author)}의 연구 · 사용자 연구</p>${gameHtml(chapter.game)}${NOTATION_NOTE}<h2>수순과 해설</h2>${chapterHtml(chapter.root)}${nav}`
  html = html
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace('<!--seo-head-->', head)
    .replace('<!--seo-body-->', `<main class="seo-fallback">${body}</main>`)
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
  res.end(html)
  return true
}

/** Sitemap of the user studies that may be indexed */
export function handleUserStudySitemap(d: UserStudyDeps, res: http.ServerResponse) {
  const urls: string[] = []
  for (const r of listedStudies(d)) {
    if (likesOf(d.db, r.id) < SEO_LIKES) continue
    const chapters = JSON.parse(r.chapters) as { id: string }[]
    chapters.forEach((c, j) => {
      const loc = abs(j === 0 ? `/study/${r.id}` : `/study/${r.id}/${c.id}`)
      urls.push(`  <url>\n    <loc>${loc}</loc>\n    <lastmod>${new Date(r.updated).toISOString()}</lastmod>\n    <priority>0.5</priority>\n  </url>`)
    })
  }
  res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-cache' })
  res.end(
    `<?xml version="1.0" encoding="UTF-8"?>\n<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
  )
}
