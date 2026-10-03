import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ClassIcon } from './icons'
import type { MoveClass } from './review'
import { isMainline, mainline, type Tree } from './tree'

interface Props {
  tree: Tree
  current: number
  classes: Map<number, MoveClass>
  onSelect: (id: number) => void
  onDelete?: (id: number) => void
  onPromote?: (id: number) => void
  emptyText?: string
}

// The game always starts with 초, so odd plies are 초's moves.
const isChoPly = (ply: number) => ply % 2 === 1
const moveNo = (ply: number) => Math.ceil(ply / 2)

export default function MoveList({ tree, current, classes, onSelect, onDelete, onPromote, emptyText }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<{ id: number; x: number; y: number } | null>(null)

  useEffect(() => {
    ref.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' })
  }, [current])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menu])

  const { nodes } = tree
  const openMenu = (e: React.MouseEvent, id: number) => {
    if (!onDelete) return
    e.preventDefault()
    setMenu({ id, x: e.clientX, y: e.clientY })
  }

  const cell = (id?: number, placeholder = false) => {
    if (id === undefined) return <span className="move empty">{placeholder ? '…' : ''}</span>
    const cls = classes.get(id)
    return (
      <span
        className={`move ${current === id ? 'active' : ''}`}
        onClick={() => onSelect(id)}
        onContextMenu={(e) => openMenu(e, id)}
      >
        {cls && <ClassIcon cls={cls} size={16} />}
        {nodes[id].san}
      </span>
    )
  }

  const renderLine = (start: number): ReactNode[] => {
    const out: ReactNode[] = []
    let id: number | undefined = start
    let first = true
    let needNumber = true
    while (id !== undefined) {
      const n: (typeof nodes)[number] = nodes[id]
      const label = isChoPly(n.ply) ? `${moveNo(n.ply)}. ` : needNumber ? `${moveNo(n.ply)}... ` : ''
      const nid = n.id
      out.push(
        <span
          key={'v' + nid}
          className={`vmove ${current === nid ? 'active' : ''}`}
          onClick={() => onSelect(nid)}
          onContextMenu={(e) => openMenu(e, nid)}
        >
          {label}
          {classes.get(nid) && <ClassIcon cls={classes.get(nid)!} size={14} />}
          {n.san}
        </span>,
      )
      needNumber = false
      if (!first) {
        for (const alt of nodes[n.parent!].children.slice(1)) {
          out.push(
            <span key={'p' + alt} className="vparen">
              ( {renderLine(alt)} )
            </span>,
          )
          needNumber = true
        }
      }
      first = false
      id = n.children[0]
    }
    return out
  }

  const items: ReactNode[] = []
  let row: { n: number; cho?: number; han?: number; choPlaceholder?: boolean } | null = null
  const flush = () => {
    if (!row) return
    const r = row
    items.push(
      <div className="move-row" key={'r' + (r.cho ?? r.han)}>
        <span className="move-no">{r.n}.</span>
        {cell(r.cho, r.choPlaceholder)}
        {cell(r.han)}
      </div>,
    )
    row = null
  }

  for (const id of mainline(tree)) {
    const n = nodes[id]
    if (isChoPly(n.ply)) {
      flush()
      row = { n: moveNo(n.ply), cho: id }
    } else if (row) {
      row.han = id
    } else {
      row = { n: moveNo(n.ply), han: id, choPlaceholder: true }
    }
    const alts = nodes[n.parent!].children.slice(1)
    if (alts.length) {
      flush()
      items.push(
        <div className="variations" key={'vars' + id}>
          {alts.map((a) => (
            <div className="variation" key={a}>
              {renderLine(a)}
            </div>
          ))}
        </div>,
      )
    }
    if (!isChoPly(n.ply)) flush()
  }
  flush()

  return (
    <div className="movelist" ref={ref}>
      {items.length === 0 && <div className="movelist-empty">{emptyText ?? '판 위에서 수를 두면 여기에 기보가 쌓여요.'}</div>}
      {items}
      {menu && (
        <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}>
          {!isMainline(tree, menu.id) && onPromote && (
            <button
              onClick={() => {
                onPromote(menu.id)
                setMenu(null)
              }}
            >
              변화도 올리기
            </button>
          )}
          <button
            onClick={() => {
              onDelete?.(menu.id)
              setMenu(null)
            }}
          >
            여기부터 삭제
          </button>
        </div>
      )}
    </div>
  )
}
