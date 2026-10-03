import { ClassIcon } from './icons'
import type { Opening } from './openings'

/** chess.com-style opening name above the move list (book icon, name; famous lines link to their page). */
/** `link`: show the link to the study page that named this position (off during a live game) */
export function OpeningBar({ opening, link = true }: { opening: Opening | null; link?: boolean }) {
  if (!opening) return null
  return (
    <div className="opening-bar" title={`초 ${opening.cho.setup} · 한 ${opening.han.setup}`}>
      <ClassIcon cls="book" size={16} />
      <span className="opening-name">{opening.name}</span>
      {link && opening.named?.page && (
        <a className="opening-link" href={opening.named.page} title={`${opening.named.title} 연구 보기`}>
          연구
        </a>
      )}
    </div>
  )
}
