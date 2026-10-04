// Tournament records (대회 기보, server/records.ts) on the client: the list, and a record as an analysis-board
// import whose review comes from the server like a finished site game's.
import type { GameImport } from './Analysis'
import { SETUPS, replay, startFen, type GameResult, type Setup } from './janggi'
import { api, savedToken } from './net'

export interface RecordSummary {
  id: string
  cho: string
  han: string
  choSetup: Setup
  hanSetup: Setup
  event: string
  round: string
  date: string
  result: GameResult | null
  reason: string
  source: string
  plies: number
  submitter: string
  created: number
  /** the official study about this game, once the researcher has written it */
  study?: string
}

export interface RecordDetail extends RecordSummary {
  note: string
  startFen: string
  uci: string[]
  owner: boolean
  admin: boolean
}

/** What people write about a record (upload and later fixes) */
export interface RecordInfo {
  choName: string
  hanName: string
  event: string
  round: string
  date: string
  result: '' | GameResult
  reason: string
  source: string
  note: string
}

export const emptyInfo = (): RecordInfo => ({ choName: '', hanName: '', event: '', round: '', date: '', result: '', reason: '', source: '', note: '' })
export const infoOf = (r: RecordDetail): RecordInfo => ({
  choName: r.cho,
  hanName: r.han,
  event: r.event,
  round: r.round,
  date: r.date,
  result: r.result ?? '',
  reason: r.reason,
  source: r.source,
  note: r.note,
})

export const recordTitle = (r: Pick<RecordSummary, 'event' | 'round'>) => [r.event, r.round].filter(Boolean).join(' ')

export const loadRecords = () => api<{ records: RecordSummary[] }>('/records').then((r) => r.records)

export async function loadRecordImport(id: string): Promise<GameImport> {
  const { record: r } = await api<{ record: RecordDetail }>(`/records/${id}`, savedToken())
  return {
    key: r.id + ':' + Date.now(),
    startFen: r.startFen,
    moves: replay(r.startFen, r.uci),
    cho: r.cho,
    han: r.han,
    review: true,
    record: r,
    result: r.result,
    reason: r.reason || null,
  }
}

/** The two setups of a standard starting position, or null */
export function setupsOf(fen: string): { cho: Setup; han: Setup } | null {
  for (const cho of SETUPS) for (const han of SETUPS) if (startFen(cho, han) === fen) return { cho, han }
  return null
}

export function uploadRecord(start: string, moves: string[], info: RecordInfo) {
  const setups = setupsOf(start)
  if (!setups) return Promise.reject(new Error('기본 차림에서 시작한 기보만 올릴 수 있어요'))
  return api<{ id: string }>('/records', savedToken(), { choSetup: setups.cho, hanSetup: setups.han, moves, ...info })
}

export const saveRecordInfo = (id: string, info: RecordInfo) => api(`/records/${id}/save`, savedToken(), { ...info })
export const deleteRecord = (id: string) => api(`/records/${id}/delete`, savedToken(), {})
