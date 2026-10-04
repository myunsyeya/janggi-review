// Study chapters as plain HTML for crawlers: used at build time (scripts/seo.ts) for the official studies and by the
// server (server/userStudyPages.ts) for user studies.
import type { GameInfo, StudyNode } from './studyFormat.ts'

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const NOTATION_NOTE = `<p>기보는 이 사이트의 표기법으로 적었어요(H 마, E 상, C 포, R 차, K 궁, A 사, 졸·병은 글자 없음, 줄 a~i·선 1~10). + 평가는 초에게 유리하다는 뜻이에요. <a href="/notation">기보 표기법 보기</a></p>`

/** A recorded game's players and event, as one line */
export function gameHtml(game?: GameInfo) {
  if (!game) return ''
  const where = [game.event, game.round, game.date].filter(Boolean).join(' · ')
  return `<p>초 ${esc(game.cho ?? '?')} 대 한 ${esc(game.han ?? '?')}${where ? ` · ${esc(where)}` : ''}${game.result ? ` · ${esc(game.result)}` : ''}</p>`
}

/** People a recorded game names, for keywords */
export const gamePeople = (game?: GameInfo) => [game?.cho, game?.han, game?.event].filter((x): x is string => !!x)

export const short = (s: string) => ([...s].length > 80 ? [...s].slice(0, 79).join('') + '…' : s)

/**
 * Moves and comments as readable HTML: the main line in paragraphs (a new paragraph wherever there is a comment),
 * the alternatives to a move as a list right after it, deeper variations inline in parentheses.
 */
export function chapterHtml(root: StudyNode) {
  const label = (ply: number, n: StudyNode) => `<b>${esc(`${Math.ceil(ply / 2)}${ply % 2 ? '.' : '...'} ${n.san ?? ''}${(n.glyphs ?? []).join('')}`)}</b>`
  const inline = (start: StudyNode, ply: number): string => {
    let out = ''
    for (let n: StudyNode | undefined = start, p = ply; n; n = n.ch[0], p++) {
      out += ` ${label(p, n)}`
      if (n.comment) out += ` ${esc(n.comment)}`
      for (const alt of n.ch.slice(1)) out += ` (${inline(alt, p + 1)})`
    }
    return out.trim()
  }
  let html = root.comment ? `<p>${esc(root.comment)}</p>` : ''
  let para: string[] = []
  let parent = root
  for (let n: StudyNode | undefined = root.ch[0], p = 1; n; parent = n, n = n.ch[0], p++) {
    para.push(label(p, n))
    const alts = parent.ch.slice(1)
    if (n.comment || alts.length || !n.ch.length) {
      html += `<p>${para.join(' ')}${n.comment ? ' ' + esc(n.comment) : ''}</p>`
      para = []
      if (alts.length) html += `<ul>${alts.map((a) => `<li>변화: ${inline(a, p)}</li>`).join('')}</ul>`
    }
  }
  return html
}

