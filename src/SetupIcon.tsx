import { HANJA, SETUPS, type Setup } from './janggi'

function octagon(r: number) {
  const pts: string[] = []
  for (let k = 0; k < 8; k++) {
    const a = ((22.5 + 45 * k) * Math.PI) / 180
    pts.push(`${(r * Math.cos(a)).toFixed(3)},${(r * Math.sin(a)).toFixed(3)}`)
  }
  return pts.join(' ')
}

const R: Record<string, number> = { r: 0.42, n: 0.42, b: 0.42, a: 0.32 }

/**
 * A setup's back rank as pictures. By default it is drawn the way that player sees it
 * (the setup name is read from their own left); `mirror` draws it as the opponent sees it.
 */
export function SetupIcon({
  setup,
  side,
  mirror = false,
  compact = false,
}: {
  setup: Setup
  side: "cho" | "han"
  mirror?: boolean
  compact?: boolean // only the four 마/상 points, drawn large
}) {
  const [l1, l2, r1, r2] = [...setup].map((c) => (c === "마" ? "n" : "b"))
  let slots = compact ? [l1, l2, "", r1, r2] : ["r", l1, l2, "a", "", "a", r1, r2, "r"]
  if (mirror) slots = slots.reverse()
  const color = side === 'cho' ? 'var(--cho)' : 'var(--han)'
  return (
    <svg className={`setup-icon ${compact ? "compact" : ""}`} viewBox={`0 0 ${slots.length} 1`} role="img" aria-label={setup}>
      <line x1={0.5} x2={slots.length - 0.5} y1={0.5} y2={0.5} stroke="var(--grid)" strokeWidth={0.04} />
      {slots.map((t, i) =>
        t ? (
          <g key={i} transform={`translate(${i + 0.5},0.5)`} opacity={t === 'r' || t === 'a' ? 0.45 : 1}>
            <polygon points={octagon(R[t])} fill="var(--piece-face)" stroke="var(--piece-edge)" strokeWidth={0.04} />
            <text
              y={0.02}
              fontSize={R[t] * 1.15}
              fill={color}
              textAnchor="middle"
              dominantBaseline="central"
              className="hanja"
            >
              {HANJA[t][side === 'cho' ? 0 : 1]}
            </text>
          </g>
        ) : null,
      )}
    </svg>
  )
}

/** The four setups as picture buttons. */
export function SetupPicker({
  side,
  value,
  mirror = false,
  onPick,
  onHover,
}: {
  side: 'cho' | 'han'
  value?: Setup
  mirror?: boolean
  onPick: (s: Setup) => void
  onHover?: (s: Setup | null) => void
}) {
  return (
    <div className="setup-grid">
      {SETUPS.map((s) => (
        <button
          key={s}
          className={`setup-option ${value === s ? 'chosen' : ''}`}
          onClick={() => onPick(s)}
          onMouseEnter={() => onHover?.(s)}
          onMouseLeave={() => onHover?.(null)}
        >
          <SetupIcon setup={s} side={side} mirror={mirror} compact />
          <span className="setup-name">{s}</span>
        </button>
      ))}
    </div>
  )
}
