// Build step: compiles the research notes in content/studies/<id>/ (study.json + NN-name.pgn chapters)
// into public/studies/index.json, public/studies/<id>.json and public/studies/topics.json (topic -> English path).
// Chapter files are NN-english-name.pgn: NN orders them, the name is the chapter's path. Fails on any illegal move
// and on any topic missing from content/studies/topics.json.
import fs from 'node:fs'
import path from 'node:path'
import { loadRules, startFen, withBoard } from '../src/janggi.ts'
import { parseChapter, type StudyNode } from '../src/studyFormat.ts'

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
  request?: string // answers a game-analysis request: "<user study id>/<chapter id>"
}

const TOPICS = JSON.parse(fs.readFileSync(path.join(SRC, 'topics.json'), 'utf8')) as Record<string, string>
delete TOPICS._comment
for (const slug of Object.values(TOPICS)) if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`topics.json: bad path "${slug}"`)

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })
const index = []
// position (board + side to move) -> the name a study gave it, and where
const names: Record<string, { name: string; study: string; chapter: string; path: string; moves: string[] }> = {}
const positionKey = (fen: string) => fen.split(' ').slice(0, 2).join(' ')
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
  if (meta.request && !/^u-[a-z0-9]{8}\/c[a-z0-9]{4}$/.test(meta.request)) throw new Error(`${id}: "request" must be "<user study id>/<chapter id>"`)
  for (const c of chapters) {
    if (meta.request && !c.game) throw new Error(`${id}/${c.id}: a game analysis keeps the game headers ([Event] [ChoPlayer] [HanPlayer] …) in every chapter`)
    if (!c.game) continue
    const named = (n: StudyNode): boolean => !!n.name || n.ch.some(named)
    if (named(c.root)) throw new Error(`${id}/${c.id}: a recorded game names no positions ([%name] belongs in opening studies)`)
  }
  for (const c of chapters) if (!c.root.comment) throw new Error(`${id}/${c.id}: start the chapter with a { comment } that sums it up (used as its search description)`)
  meta.topics = [...new Set([...meta.topics, ...chapters.flatMap((c) => c.topics ?? [])])]
  for (const t of meta.topics) if (!TOPICS[t]) throw new Error(`${id}: topic "${t}" has no English path in content/studies/topics.json`)
  chapters.forEach((ch, i) => {
    const chapterPath = i === 0 ? `/study/${id}` : `/study/${id}/${ch.id}`
    const visit = (node: StudyNode, fen: string, moves: string[]) => {
      for (const c of node.ch) {
        const after = withBoard(fen, (b) => (b.push(c.uci!), b.fen()))
        if (c.name) {
          const key = positionKey(after)
          const had = names[key]
          if (had && had.name !== c.name) throw new Error(`${id}/${ch.id}: this position is already named "${had.name}" (${had.path}); one name per position`)
          names[key] ??= { name: c.name, study: id, chapter: ch.id, path: chapterPath, moves: [...moves, c.uci!] }
        }
        visit(c, after, [...moves, c.uci!])
      }
    }
    visit(ch.root, startFen(ch.cho, ch.han), [])
  })
  fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify({ id, ...meta, chapters }))
  index.push({ id, ...meta, chapters: chapters.map((c) => ({ id: c.id, name: c.name, topics: c.topics })) })
  console.log(`studies: ${id} (${chapters.length} chapters)`)
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index))
fs.writeFileSync(path.join(OUT, 'topics.json'), JSON.stringify(TOPICS))
fs.writeFileSync(path.join(OUT, 'names.json'), JSON.stringify(names))
console.log(`studies: ${Object.keys(names).length} named positions`)
