// Build step: compiles the research notes in content/studies/<id>/ (study.json + NN-name.pgn chapters)
// into public/studies/index.json, public/studies/<id>.json and public/studies/topics.json (topic -> English path).
// Chapter files are NN-english-name.pgn: NN orders them, the name is the chapter's path. Fails on any illegal move
// and on any topic missing from content/studies/topics.json.
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

const TOPICS = JSON.parse(fs.readFileSync(path.join(SRC, 'topics.json'), 'utf8')) as Record<string, string>
delete TOPICS._comment
for (const slug of Object.values(TOPICS)) if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`topics.json: bad path "${slug}"`)

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
    .map((f) => {
      const m = /^\d+-([a-z0-9-]+)\.pgn$/.exec(f)
      if (!m) throw new Error(`${id}/${f}: chapter files must be named NN-english-name.pgn`)
      return parseChapter(fs.readFileSync(path.join(dir, f), 'utf8'), m[1])
    })
  if (!chapters.length) throw new Error(`${id}: no chapters`)
  meta.topics = [...new Set([...meta.topics, ...chapters.flatMap((c) => c.topics ?? [])])]
  for (const t of meta.topics) if (!TOPICS[t]) throw new Error(`${id}: topic "${t}" has no English path in content/studies/topics.json`)
  fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify({ id, ...meta, chapters }))
  index.push({ id, ...meta, chapters: chapters.map((c) => ({ id: c.id, name: c.name, topics: c.topics })) })
  console.log(`studies: ${id} (${chapters.length} chapters)`)
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index))
fs.writeFileSync(path.join(OUT, 'topics.json'), JSON.stringify(TOPICS))
