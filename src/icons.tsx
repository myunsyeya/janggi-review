import { CLASS_INFO, type MoveClass } from './review'

const TEXT: Partial<Record<MoveClass, string>> = {
  brilliant: '!!',
  great: '!',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
}

/** Contents of a 24×24 class badge: colored disc + glyph. */
export function classGlyph(cls: MoveClass) {
  const text = TEXT[cls]
  return (
    <>
      <circle cx={12} cy={12} r={11} fill={CLASS_INFO[cls].color} stroke="#ffffff" strokeWidth={1.2} />
      {text && (
        <text
          x={12}
          y={12.6}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={text.length > 1 ? 11 : 14}
          fontWeight={900}
          fill="#fff"
          fontFamily="-apple-system, 'Segoe UI', sans-serif"
          letterSpacing={-0.6}
        >
          {text}
        </text>
      )}
      {cls === 'best' && <path d="M12 5.2l2 4.3 4.7.5-3.5 3.2 1 4.6L12 15.5l-4.2 2.3 1-4.6-3.5-3.2 4.7-.5z" fill="#fff" />}
      {cls === 'excellent' && (
        <path d="M7 11h2.2l2.6-4.6c1 0 1.8.8 1.6 1.8l-.4 2.4h3.6c.9 0 1.5.8 1.3 1.6l-1.1 4.7c-.2.6-.7 1-1.3 1H9.2V11zM5.2 11H7v6.9H5.2z" fill="#fff" />
      )}
      {cls === 'good' && <path d="M7 12.4l3.4 3.4L17.2 9" stroke="#fff" strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      {cls === 'book' && <path d="M6.5 7.5c2-1 4-1 5.5.3 1.5-1.3 3.5-1.3 5.5-.3v9c-2-1-4-1-5.5.3-1.5-1.3-3.5-1.3-5.5-.3z" fill="#fff" />}
      {cls === 'miss' && <path d="M8.3 8.3l7.4 7.4M15.7 8.3l-7.4 7.4" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" />}
    </>
  )
}

export function ClassIcon({ cls, size = 18 }: { cls: MoveClass; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="class-icon" aria-label={CLASS_INFO[cls].label}>
      {classGlyph(cls)}
    </svg>
  )
}
