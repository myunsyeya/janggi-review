// Likes for studies (official ones from content/studies/ and user studies, see userStudies.ts).
import type http from 'node:http'
import type { DatabaseSync } from 'node:sqlite'

export interface StudyDeps {
  db: DatabaseSync
  userId: (auth: string | undefined) => number | undefined
  json: (res: http.ServerResponse, status: number, body: unknown) => void
  onLike?: () => void
}

export function initStudies(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS study_likes (
      study_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      PRIMARY KEY (study_id, user_id)
    );
  `)
}

const ID = /^[a-z0-9-]{1,60}$/

/** GET /api/study-likes?ids=a,b → counts (+ which ones I liked); POST /api/study-likes/:id → toggle. */
export function handleStudies(d: StudyDeps, req: http.IncomingMessage, res: http.ServerResponse, url: URL, auth?: string) {
  const { db, json } = d
  const me = d.userId(auth)
  if (url.pathname === '/api/study-likes' && req.method === 'GET') {
    const ids = (url.searchParams.get('ids') ?? '').split(',').filter((id) => ID.test(id)).slice(0, 100)
    const likes: Record<string, number> = {}
    const mine: string[] = []
    for (const id of ids) {
      likes[id] = (db.prepare('SELECT COUNT(*) n FROM study_likes WHERE study_id = ?').get(id) as { n: number }).n
      if (me && db.prepare('SELECT 1 FROM study_likes WHERE study_id = ? AND user_id = ?').get(id, me)) mine.push(id)
    }
    json(res, 200, { likes, mine })
    return true
  }
  const m = /^\/api\/study-likes\/([a-z0-9-]+)$/.exec(url.pathname)
  if (m && req.method === 'POST' && ID.test(m[1])) {
    if (!me) return json(res, 401, { error: '로그인하면 좋아요를 누를 수 있어요' }), true
    const id = m[1]
    const had = db.prepare('SELECT 1 FROM study_likes WHERE study_id = ? AND user_id = ?').get(id, me)
    if (had) db.prepare('DELETE FROM study_likes WHERE study_id = ? AND user_id = ?').run(id, me)
    else db.prepare('INSERT INTO study_likes (study_id, user_id) VALUES (?, ?)').run(id, me)
    const n = (db.prepare('SELECT COUNT(*) n FROM study_likes WHERE study_id = ?').get(id) as { n: number }).n
    d.onLike?.()
    json(res, 200, { liked: !had, likes: n })
    return true
  }
  return false
}
