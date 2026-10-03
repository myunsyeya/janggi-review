import { ClassIcon } from './icons'
import type { Opening } from './openings'

/** chess.com-style opening name above the move list (book icon, name; famous lines link to their page). */
export function OpeningBar({ opening }: { opening: Opening | null }) {
  if (!opening) return null
  return (
    <div className="opening-bar" title={`초 ${opening.cho.setup} · 한 ${opening.han.setup}`}>
      <ClassIcon cls="book" size={16} />
      <span className="opening-name">{opening.name}</span>
      {opening.named?.page && (
        <a className="opening-link" href={opening.named.page}>
          해설
        </a>
      )}
    </div>
  )
}
