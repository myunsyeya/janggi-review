// Renders public/og.png (1200x630 link preview) from the live board. Run by hand when the look changes:
//   node scripts/og-image.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'
const out = new URL('../public/og.png', import.meta.url).pathname
const browser = await chromium.launch()
const shot = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 })
await shot.goto('https://myunsyeya.com/analysis')
await shot.waitForSelector('main:not([hidden]) svg.board')
await shot.addStyleTag({ content: '.board polygon[fill^="var(--arrow"], .board g[opacity] { display: none }' }) // no engine arrow
await shot.waitForTimeout(500)
const board = (await shot.locator('main:not([hidden]) svg.board').screenshot()).toString('base64')
const card = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await card.setContent(`<!doctype html><html><body style="margin:0">
<div style="width:1200px;height:630px;background:#302e2b;display:flex;align-items:center;gap:56px;padding:0 64px;box-sizing:border-box;
  font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#fff">
  <img src="data:image/png;base64,${board}" style="height:560px;border-radius:10px;box-shadow:0 20px 50px #0009" />
  <div style="display:flex;flex-direction:column;gap:18px">
    <div style="font-family:'Songti TC','STSong',serif;font-weight:800;font-size:40px;color:#81b64c">楚漢</div>
    <div style="font-size:64px;font-weight:800;letter-spacing:-1px">초한 장기</div>
    <div style="font-size:30px;font-weight:700;color:#ffffffcc;line-height:1.4">온라인 장기 대국과<br/>AI 기보 분석</div>
    <div style="font-size:21px;color:#ffffff99;line-height:1.7;margin-top:6px">
      레이팅 대국 · 게임 리뷰 · 탁월한 수부터 블런더까지<br/>Fairy-Stockfish NNUE 엔진
    </div>
    <div style="font-size:20px;color:#81b64c;font-weight:700;margin-top:10px">myunsyeya.com</div>
  </div>
</div></body></html>`)
await card.waitForTimeout(300)
fs.writeFileSync(out, await card.screenshot())
console.log('wrote', out)
await browser.close()
