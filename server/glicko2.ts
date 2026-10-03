// Glicko-2 (Glickman 2012), updated after every game like lichess.

export interface Rating {
  rating: number
  rd: number
  vol: number
}

export const INITIAL: Rating = { rating: 1500, rd: 350, vol: 0.06 }

const SCALE = 173.7178
const TAU = 0.5
const MIN_RD = 45
const MAX_RD = 350

/** New rating for `p` after one game against `o` with `score` (1 win, 0.5 draw, 0 loss). */
export function update(p: Rating, o: Rating, score: number): Rating {
  const mu = (p.rating - 1500) / SCALE
  const phi = p.rd / SCALE
  const muJ = (o.rating - 1500) / SCALE
  const phiJ = o.rd / SCALE

  const g = 1 / Math.sqrt(1 + (3 * phiJ * phiJ) / (Math.PI * Math.PI))
  const E = 1 / (1 + Math.exp(-g * (mu - muJ)))
  const v = 1 / (g * g * E * (1 - E))
  const delta = v * g * (score - E)

  // new volatility (Illinois algorithm)
  const a = Math.log(p.vol * p.vol)
  const f = (x: number) => {
    const ex = Math.exp(x)
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * (phi * phi + v + ex) ** 2) - (x - a) / (TAU * TAU)
  }
  let A = a
  let B: number
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v)
  } else {
    let k = 1
    while (f(a - k * TAU) < 0) k++
    B = a - k * TAU
  }
  let fA = f(A)
  let fB = f(B)
  for (let i = 0; i < 100 && Math.abs(B - A) > 1e-6; i++) {
    const C = A + ((A - B) * fA) / (fB - fA)
    const fC = f(C)
    if (fC * fB <= 0) {
      A = B
      fA = fB
    } else {
      fA /= 2
    }
    B = C
    fB = fC
  }
  const vol = Math.exp(A / 2)

  const phiStar = Math.sqrt(phi * phi + vol * vol)
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v)
  const muNew = mu + phiNew * phiNew * g * (score - E)

  return {
    rating: SCALE * muNew + 1500,
    rd: Math.min(MAX_RD, Math.max(MIN_RD, SCALE * phiNew)),
    vol,
  }
}
