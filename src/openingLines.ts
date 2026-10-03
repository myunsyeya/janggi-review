// Illustrative move orders that reach the reference diagrams of 귀마 대 귀마 후수 포진
// (DC 장기 마이너 갤러리, 2023-05-30). The positions come from the diagrams; the move orders are ours,
// checked for legality by scripts/test-openings.ts. Used by the tests.

export const REF_SETUP = { cho: '상마상마', han: '마상마상' } as const

/** 초 (선수): 진마, 면포, 졸 정리, 중앙상, 귀마 */
export const CHO_LINE = ['h1g3', 'h3e3', 'a4b4', 'e4f4', 'g1e4', 'c1d3']

export const HAN_LINES: { name: string; han: string[] }[] = [
  { name: '정형 중앙병좌포진', han: ['c10d8', 'h10g8', 'h8e8', 'e7d7', 'g10e7', 'i7h7'] },
  { name: '정형 좌진병상포진', han: ['c10d8', 'h10g8', 'c7c6', 'h8e8', 'b10d7', 'i7h7'] },
  { name: '정형 좌진병좌포진', han: ['c10d8', 'h10g8', 'c7b7', 'h8e8', 'i7h7'] },
  { name: '변형 중앙병좌포진', han: ['c10d8', 'b8e8', 'e7d7', 'h10g8', 'i7h7'] },
  { name: '변형 좌진병상포진', han: ['c10d8', 'b8e8', 'c7c6', 'h10g8', 'i7h7'] },
  { name: '변형 좌진병우포진', han: ['c10d8', 'b8e8', 'c7d7', 'h10g8', 'i7h7'] },
  { name: '변형 좌진병좌포진', han: ['c10d8', 'b8e8', 'c7b7', 'h10g8', 'i7h7'] },
  { name: '최국수포진', han: ['c10d8', 'b8e8', 'e7d7', 'i7h7', 'i10i9'] },
  { name: '5선 최국수포진 (김경만포진)', han: ['c10d8', 'e9d9', 'e7d7', 'i7h7', 'i10i6'] },
]

export const interleave = (han: string[]) => han.flatMap((m, i) => [CHO_LINE[i], m])

