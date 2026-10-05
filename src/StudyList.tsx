// Study list, laid out like lichess.org/study/topic/…: sub-navigation on the left, a card grid on the right.
import { useEffect, useMemo, useState } from 'react'
import { chapterHref, loadMyStudies, loadStudyIndex, loadTopics, navigate, timeAgo, topicHref, topicPath, type StudyMeta } from './studyData'
import { api, savedToken } from './net'

const SORTS = [
  ['hot', '유행하는 순'],
  ['newest', '최근 추가된 순'],
  ['oldest', '오래된 순'],
  ['updated', '최근 수정된 순'],
  ['popular', '인기 순'],
  ['alphabetical', '가나다 순'],
] as const
type Sort = (typeof SORTS)[number][0]

export default function StudyList({ topicSlug, mine = false, active }: { topicSlug: string | null; mine?: boolean; active: boolean }) {
  const [myStudies, setMyStudies] = useState<(StudyMeta & { published?: boolean; hidden?: boolean })[] | null>(null)
  const [all, setAll] = useState<StudyMeta[] | null>(null)
  const [likes, setLikes] = useState<Record<string, number>>({})
  const [sort, setSort] = useState<Sort>('hot')

  const [slugs, setSlugs] = useState<Record<string, string>>({})
  useEffect(() => {
    loadStudyIndex().then(setAll)
    loadTopics().then(setSlugs)
  }, [])
  useEffect(() => {
    if (mine) loadMyStudies().then(setMyStudies)
  }, [mine])
  const create = async () => {
    if (!savedToken()) return alert('로그인하면 연구를 쓸 수 있어요 (대국 화면에서 로그인)')
    try {
      const r = await api<{ id: string }>('/user-studies', savedToken(), {})
      navigate(`/study/${r.id}/edit`)
    } catch (e) {
      alert((e as Error).message)
    }
  }
  // the address has the English path; the page shows the Korean name
  const topic = topicSlug ? (Object.keys(slugs).find((t) => slugs[t] === topicSlug) ?? (Object.keys(slugs).length ? topicSlug : null)) : null
  useEffect(() => {
    if (active && (!topicSlug || topic)) document.title = `${mine ? '내 연구' : (topic ?? '모든 연구')} — 장기 연구 | 초한 장기`
  }, [active, topic, topicSlug, mine])
  useEffect(() => {
    if (!active || !all?.length) return
    api<{ likes: Record<string, number> }>(`/study-likes?ids=${all.map((s) => s.id).join(',')}`).then((r) => setLikes(r.likes), () => {})
  }, [active, all])

  const topics = useMemo(() => {
    const n = new Map<string, number>()
    for (const s of all ?? []) for (const t of s.topics) n.set(t, (n.get(t) ?? 0) + 1)
    return [...n].sort((a, b) => b[1] - a[1])
  }, [all])

  const list = useMemo(() => {
    const rows = mine ? (myStudies ?? []) : (all ?? []).filter((s) => !topic || s.topics.includes(topic))
    const like = (s: StudyMeta) => likes[s.id] ?? 0
    const time = (d: string) => new Date(d).getTime()
    const hot = (s: StudyMeta) => (like(s) + 1) / Math.pow((Date.now() - time(s.updated)) / 3_600_000 + 2, 1.5)
    const by: Record<Sort, (a: StudyMeta, b: StudyMeta) => number> = {
      hot: (a, b) => hot(b) - hot(a),
      newest: (a, b) => time(b.created) - time(a.created),
      oldest: (a, b) => time(a.created) - time(b.created),
      updated: (a, b) => time(b.updated) - time(a.updated),
      popular: (a, b) => like(b) - like(a),
      alphabetical: (a, b) => a.title.localeCompare(b.title, 'ko'),
    }
    return [...rows].sort(by[sort])
  }, [all, topic, sort, likes, mine, myStudies])

  return (
    <div className="studies">
      <aside className="studies-nav">
        <a href="/study" className={!topic && !mine ? 'active' : ''}>
          모든 연구
        </a>
        <a href="/study/mine" className={mine ? 'active' : ''}>
          내 연구
        </a>
        <div className="studies-nav-title">주제</div>
        {topics.map(([t, n]) => (
          <a key={t} href={topicPath(slugs, t)} className={topic === t ? 'active' : ''}>
            {t} <span className="muted">{n}</span>
          </a>
        ))}
      </aside>

      <section className="studies-box">
        <header className="studies-head">
          <h1>{mine ? '내 연구' : (topic ?? '모든 연구')}</h1>
          <button className="btn primary study-create" onClick={create}>
            + 연구 만들기
          </button>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {SORTS.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </header>
        {(mine ? myStudies : all) && !list.length && <div className="muted pad">{mine ? '아직 쓴 연구가 없어요. 오른쪽 위의 "연구 만들기"로 시작해 보세요.' : '연구를 엔진(NNUE)으로 처음부터 다시 쓰고 있어요. 곧 새 연구가 올라와요.'}</div>}
        <div className="study-grid">
          {list.map((s) => {
            // under a topic, the chapters tagged with it come first and are highlighted
            const hit = (c: StudyMeta['chapters'][number]) => !!topic && !!c.topics?.includes(topic)
            const chapters = [...s.chapters.filter(hit), ...s.chapters.filter((c) => !hit(c))].slice(0, 4)
            return (
              <div className="study-card" key={s.id}>
                <span className="study-icon" aria-hidden>
                  楚漢
                </span>
                <div className="study-card-main">
                  <a className="study-card-title" href={mine ? `/study/${s.id}/edit` : topicHref(s, topic)}>
                    {s.title}
                  </a>
                  <div className="study-card-meta">
                    ♡ {likes[s.id] ?? 0} · {s.author ?? '초한 장기'} · {timeAgo(s.updated)}
                    {s.user && <span className="study-badge">사용자 연구</span>}
                    {mine && <span className="study-badge">{'hidden' in s && s.hidden ? '숨겨짐' : 'published' in s && s.published ? '공개' : '비공개'}</span>}
                  </div>
                  <ol className="study-card-chapters">
                    {chapters.map((c) => (
                      <li key={c.id} className={hit(c) ? 'hit' : ''}>
                        <a href={chapterHref(s, c.id)}>{c.name}</a>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="study-card-side muted small">{s.chapters.length} 챕터</div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
