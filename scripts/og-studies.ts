// Build step: a link-preview image (1200x630) for every study chapter, showing the position at the end of the
// chapter's main line. Writes dist/og/study/<study>/<chapter>.png; scripts/seo.ts points og:image at it.
// The board is the app's own Board component rendered to SVG (through Vite's SSR loader), photographed with
// Playwright. Images are cached in .cache/og by content, so unchanged chapters are not redrawn.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { chromium } from 'playwright'

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
const DIST = path.join(ROOT, 'dist')
const CACHE = path.join(ROOT, '.cache/og')
const VERSION = 2 // bump when the card design changes

const studyDir = path.join(DIST, 'studies')
if (!fs.existsSync(path.join(studyDir, 'index.json'))) process.exit(0)
const index = JSON.parse(fs.readFileSync(path.join(studyDir, 'index.json'), 'utf8')) as { id: string }[]

const vite = await createServer({ root: ROOT, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const janggi = await vite.ssrLoadModule('/src/janggi.ts')
await janggi.loadRules({ wasmBinary: fs.readFileSync(path.join(ROOT, 'node_modules/ffish-es6/ffish.wasm')) })
const { chapterNodes, SHAPE_COLOR } = await vite.ssrLoadModule('/src/studyData.ts')
const Board = (await vite.ssrLoadModule('/src/Board.tsx')).default

const css = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf8')
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function card(svg: string, study: string, chapter: string, no: number) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}
  body { margin: 0; background: #302e2b; }
  .og-board { height: 560px; width: ${Math.round((560 * 9.9) / 10.9)}px; border-radius: 10px; overflow: hidden; box-shadow: 0 20px 50px #0009; flex: none; }
  </style></head><body>
<div style="width:1200px;height:630px;background:#302e2b;display:flex;align-items:center;gap:52px;padding:0 60px;box-sizing:border-box;
  font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#fff">
  <div class="og-board">${svg}</div>
  <div style="display:flex;flex-direction:column;gap:16px;min-width:0;word-break:keep-all">
    <div style="font-family:'Songti TC','STSong',serif;font-weight:800;font-size:34px;color:#81b64c">楚漢 <span style="font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;font-size:24px;color:#ffffff99;font-weight:700">장기 연구</span></div>
    <div style="font-size:30px;font-weight:700;color:#ffffffcc;line-height:1.35">${esc(study)}</div>
    <div style="font-size:${chapter.length > 18 ? 44 : 52}px;font-weight:800;letter-spacing:-1px;line-height:1.25">${no}. ${esc(chapter)}</div>
    <div style="font-size:20px;color:#81b64c;font-weight:700;margin-top:10px">myunsyeya.com</div>
  </div>
</div></body></html>`
}

let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null
let drawn = 0
let cached = 0
for (const { id } of index) {
  const study = JSON.parse(fs.readFileSync(path.join(studyDir, `${id}.json`), 'utf8'))
  for (const [i, ch] of study.chapters.entries()) {
    // the end of the chapter's main line (moves only mentioned in comments are not part of it)
    const nodes = chapterNodes(ch)
    let n = nodes[0]
    for (;;) {
      const next = n.children.find((c: number) => !nodes[c].hidden)
      if (next === undefined) break
      n = nodes[next]
    }
    const arrows = (n.shapes ?? []).map((s: { from: string; to: string; color: 'G' | 'R' | 'B' | 'Y' }) => ({ from: s.from, to: s.to, color: SHAPE_COLOR[s.color] }))
    const svg = renderToStaticMarkup(
      createElement(Board, { fen: n.fen, legal: [], flipped: false, lastMove: n.uci || undefined, arrows, interactive: false, onMove: () => {} }),
    )
    const html = card(svg, study.title, ch.name, i + 1)
    const hash = crypto.createHash('sha1').update(`${VERSION}\n${html}`).digest('hex')
    const cachedFile = path.join(CACHE, `${hash}.png`)
    if (fs.existsSync(cachedFile)) cached++
    else {
      browser ??= await chromium.launch()
      const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
      await page.setContent(html)
      await page.evaluate(() => document.fonts.ready)
      fs.mkdirSync(CACHE, { recursive: true })
      fs.writeFileSync(cachedFile, await page.screenshot())
      await page.close()
      drawn++
    }
    const out = path.join(DIST, 'og/study', id, `${ch.id}.png`)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.copyFileSync(cachedFile, out)
  }
}
await browser?.close()
await vite.close()
console.log(`og: ${drawn + cached} study images (${drawn} drawn, ${cached} cached)`)
