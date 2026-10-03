// Checks opening recognition against the nine reference diagrams of 귀마 대 귀마 후수 포진
// (DC 장기 마이너 갤러리, 2023-05-30), as legal move sequences, and their mirror images.
// Run: node scripts/test-openings.ts
import fs from 'node:fs'
import { loadRules, startFen, withBoard } from '../src/janggi.ts'
import { classifyOpening } from '../src/openings.ts'
import { HAN_LINES, REF_SETUP, interleave } from '../src/openingLines.ts'

await loadRules({ wasmBinary: fs.readFileSync(new URL('../node_modules/ffish-es6/ffish.wasm', import.meta.url)) } as never)

const start = startFen(REF_SETUP.cho, REF_SETUP.han)
const expected = (name: string) =>
  `귀마 대 귀마: 엇상 · ${name.includes('최국수') ? name : '한 ' + name} · 초 정형포진`
const cases: [string, string[]][] = HAN_LINES.map((l) => [expected(l.name), l.han])

const flip = (u: string) => u.replace(/[a-i]/g, (c) => 'abcdefghi'[8 - 'abcdefghi'.indexOf(c)])
const legal = (fen: string, ucis: string[]) =>
  withBoard(fen, (b) => ucis.every((u) => b.legalMoves().split(' ').includes(u) && (b.push(u), true)))

let failed = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`)
}
for (const [expect, han] of cases) {
  const ucis = interleave(han)
  check(expect, legal(start, ucis) && classifyOpening(start, ucis).name === expect, classifyOpening(start, ucis).name)
  const mirrored = ucis.map(flip)
  const mstart = startFen('마상마상', '상마상마')
  check('  mirrored', legal(mstart, mirrored) && classifyOpening(mstart, mirrored).name === expect)
}
// transpositions: same position by a different move order → same name
const reorder: [string, string[]][] = [
  ['최국수포진', ['c10d8', 'i7h7', 'b8e8', 'e7d7', 'i10i9']],
  ['변형 좌진병우포진', ['c10d8', 'c7d7', 'h10g8', 'b8e8', 'i7h7']],
]
for (const [name, han] of reorder) {
  const want = classifyOpening(start, interleave(HAN_LINES.find((l) => l.name === name)!.han)).name
  const got = classifyOpening(start, interleave(han)).name
  check(`transposition: ${name}`, legal(start, interleave(han)) && got === want, got)
}
check('맞상', classifyOpening(startFen('상마상마', '상마상마'), ['h1g3', 'g10f8']).matchup === '맞상')
check('엇상', classifyOpening(start, ['h1g3', 'c10d8']).matchup === '엇상')
check('원앙마 (안상차림)', classifyOpening(startFen('마상상마', '마상상마'), []).cho.formation === '원앙마')
check('양귀마 (바깥상차림)', classifyOpening(startFen('상마마상', '마상상마'), []).cho.formation === '양귀마')
process.exit(failed ? 1 : 0)
