// Move tree for the analysis board. children[0] is the main continuation, the rest are variations.

export interface MoveNode {
  id: number
  parent: number | null
  uci: string // '' for the root
  san: string
  fen: string // position after the move (root: start position)
  ply: number // moves from the start
  children: number[]
}

export interface Tree {
  nodes: Record<number, MoveNode>
  nextId: number
}

export const ROOT = 0

export function newTree(startFen: string): Tree {
  return { nodes: { [ROOT]: { id: ROOT, parent: null, uci: '', san: '', fen: startFen, ply: 0, children: [] } }, nextId: 1 }
}

/** Adds a move under `parent` (or reuses an existing identical child). Returns the new tree and the node id. */
export function addMove(tree: Tree, parent: number, uci: string, san: string, fen: string): [Tree, number] {
  const p = tree.nodes[parent]
  const existing = p.children.find((c) => tree.nodes[c].uci === uci)
  if (existing !== undefined) return [tree, existing]
  const id = tree.nextId
  const node: MoveNode = { id, parent, uci, san, fen, ply: p.ply + 1, children: [] }
  return [
    {
      nodes: { ...tree.nodes, [id]: node, [parent]: { ...p, children: [...p.children, id] } },
      nextId: id + 1,
    },
    id,
  ]
}

/** Node ids from the root's first move down to `id`. */
export function pathTo(tree: Tree, id: number): number[] {
  const out: number[] = []
  for (let n: MoveNode | undefined = tree.nodes[id]; n && n.parent !== null; n = tree.nodes[n.parent]) out.push(n.id)
  return out.reverse()
}

/** Follows the main continuation from `id` (exclusive). */
export function lineFrom(tree: Tree, id: number): number[] {
  const out: number[] = []
  for (let n = tree.nodes[id]; n.children.length; n = tree.nodes[n.children[0]]) out.push(n.children[0])
  return out
}

export const mainline = (tree: Tree) => lineFrom(tree, ROOT)

export function isMainline(tree: Tree, id: number) {
  for (let n = tree.nodes[id]; n.parent !== null; n = tree.nodes[n.parent]) {
    if (tree.nodes[n.parent].children[0] !== n.id) return false
  }
  return true
}

/** Removes `id` and everything after it. */
export function deleteFrom(tree: Tree, id: number): Tree {
  const node = tree.nodes[id]
  if (node.parent === null) return tree
  const nodes = { ...tree.nodes }
  const drop = (n: number) => {
    nodes[n].children.forEach(drop)
    delete nodes[n]
  }
  drop(id)
  const p = nodes[node.parent]
  nodes[node.parent] = { ...p, children: p.children.filter((c) => c !== id) }
  return { ...tree, nodes }
}

/** Makes the variation containing `id` the main continuation at its branch point. */
export function promote(tree: Tree, id: number): Tree {
  let n = tree.nodes[id]
  while (n.parent !== null && tree.nodes[n.parent].children[0] === n.id) n = tree.nodes[n.parent]
  if (n.parent === null) return tree
  const p = tree.nodes[n.parent]
  return {
    ...tree,
    nodes: { ...tree.nodes, [p.id]: { ...p, children: [n.id, ...p.children.filter((c) => c !== n.id)] } },
  }
}

/** Builds a tree with a single main line. */
export function treeFromMoves(startFen: string, moves: { uci: string; san: string; fen: string }[]): Tree {
  let t = newTree(startFen)
  let at = ROOT
  for (const m of moves) [t, at] = addMove(t, at, m.uci, m.san, m.fen)
  return t
}
