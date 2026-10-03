// Engine check of the learning-page example lines: flags any move losing more than 0.10 expected points.
// Run: node scripts/check-lines.cjs   (single-threaded WASM engine, takes about a minute)
const fs = require('fs')
const path = require('path')
const D = path.join(__dirname, '../node_modules/fairy-stockfish-nnue.wasm/')
const NNUE = path.join(__dirname, '../public/engine/janggi-9991472750de.nnue')
;(async () => {
  const { loadRules, withBoard, startFen, sanOf } = await import('../src/janggi.ts')
  const { HAN_LINES, REF_SETUP, interleave } = await import('../src/openingLines.ts')
  await loadRules({ wasmBinary: fs.readFileSync(path.join(__dirname, '../node_modules/ffish-es6/ffish.wasm')) })
  const sf = await require(D + 'stockfish.js')({ wasmBinary: fs.readFileSync(D + 'stockfish.wasm'), locateFile: (f) => D + f, mainScriptUrlOrBlob: D + 'stockfish.js' })
  sf.FS.writeFile('/j.nnue', fs.readFileSync(NNUE))
  let waiting = null, last = null
  sf.addMessageListener((l) => {
    if (l.startsWith('info') && l.includes(' score ') && l.includes(' pv ')) last = l
    if (l.startsWith('bestmove') && waiting) { const w = waiting; waiting = null; w(last) }
  })
  for (const c of ['setoption name UCI_Variant value janggimodern', 'setoption name EvalFile value /j.nnue']) sf.postMessage(c)
  const evalFen = (fen) => new Promise((res) => { waiting = res; last = null; sf.postMessage(`position fen ${fen}`); sf.postMessage('go depth 12') })
  const win = (line) => { const m = / score (cp|mate) (-?\d+)/.exec(line); if (!m) return 0.5; const v = +m[2]; return m[1] === 'mate' ? (v > 0 ? 1 : 0) : 1 / (1 + Math.exp(-0.00368208 * v)) }
  const start = startFen(REF_SETUP.cho, REF_SETUP.han)
  let bad = 0
  for (const { name, han } of HAN_LINES) {
    const ucis = interleave(han)
    const fens = withBoard(start, (b) => [b.fen(), ...ucis.map((u) => (b.push(u), b.fen()))])
    const sans = withBoard(start, (b) => ucis.map((u) => { const s = sanOf(b, u); b.push(u); return s }))
    const w = []
    for (const f of fens) w.push(win(await evalFen(f)))
    const notes = ucis.map((u, i) => { const loss = Math.max(0, w[i] - (1 - w[i + 1])); return { san: sans[i], loss } })
    const worst = notes.filter((n) => n.loss > 0.1)
    bad += worst.length
    console.log(`${worst.length ? 'CHECK' : 'ok   '} ${name}: ${notes.map((n) => n.san + (n.loss > 0.1 ? `(-${n.loss.toFixed(2)})` : '')).join(' ')}`)
  }
  process.exit(bad ? 1 : 0)
})()
