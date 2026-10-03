// Build step: compiles the research notes in content/studies/<id>/ (study.json + NN-name.pgn chapters)
// into public/studies/index.json and public/studies/<id>.json. Fails on any illegal move.
import fs from 'node:fs'
import path from 'node:path'
import { loadRules } from '../src/janggi.ts'
import { parseChapter } from '../src/studyFormat.ts'

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
const SRC = path.join(ROOT, 'content/studies')
const OUT = path.join(ROOT, 'public/studies')
await loadRules({ wasmBinary: fs.readFileSync(path.join(ROOT, 'node_modules/ffish-es6/ffish.wasm')) } as never)

interface Meta {
  title: string
  topics: string[]
  description: string
  created: string
  updated: string
}

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })
const index = []
for (const id of fs.existsSync(SRC) ? fs.readdirSync(SRC).sort() : []) {
  const dir = path.join(SRC, id)
  if (!fs.statSync(dir).isDirectory()) continue
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`study folder names must be lower-case ascii: ${id}`)
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'study.json'), 'utf8')) as Meta
  const chapters = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.pgn'))
    .sort()
    .map((f) => parseChapter(fs.readFileSync(path.join(dir, f), 'utf8'), f.match(/^(\d+)/)?.[1] ?? f.replace(/\.pgn$/, '')))
  if (!chapters.length) throw new Error(`${id}: no chapters`)
  fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify({ id, ...meta, chapters }))
  index.push({ id, ...meta, chapters: chapters.map((c) => ({ id: c.id, name: c.name })) })
  console.log(`studies: ${id} (${chapters.length} chapters)`)
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index))
