// The opening name shown above move lists: the classifier's descriptive name, replaced by the name a study gave to
// the latest named position on the line (position-based, so transpositions get it too), with a link to that study.
import { useEffect, useMemo, useState } from 'react'
import { replay } from './janggi'
import { classifyOpening, type Opening } from './openings'
import { loadNames, positionKey, type PositionNames } from './studyData'

export function nameOpening(start: string, line: string[], names: PositionNames): Opening | null {
  if (!line.length) return null
  const base = classifyOpening(start, line)
  if (!Object.keys(names).length) return base
  const fens = replay(start, line).map((m) => m.fen)
  for (let i = fens.length - 1; i >= 0; i--) {
    const hit = names[positionKey(fens[i])]
    if (hit) return { ...base, name: `${base.name.split(' · ')[0]} · ${hit.name}`, named: { title: hit.name, page: hit.moves ? `${hit.path}?moves=${hit.moves.join(',')}` : hit.path } }
  }
  return base
}

/** Position names from the studies (empty until loaded) */
export function usePositionNames(ready: boolean) {
  const [names, setNames] = useState<PositionNames>({})
  useEffect(() => {
    if (ready) loadNames().then(setNames, () => {})
  }, [ready])
  return names
}

export function useOpening(start: string, line: string[], ready: boolean) {
  const names = usePositionNames(ready)
  const key = line.join(' ')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (ready ? nameOpening(start, line, names) : null), [start, key, names, ready])
}
