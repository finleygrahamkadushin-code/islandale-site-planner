import { buildingMasses } from '../../buildings/masses'
import type { Ground } from '../../site/earthworks'
import type { Terrain } from '../../site/types'
import type { ObjectId, PlanObject } from '../../store/types'
import { GAP_M, LEVEL_M, type Junction } from './junctions'
import { massLabel, siteJunctions } from './junctionsSite'

/**
 * The level report of one building (old join-core levelReportFor): wings
 * off the main floor plane by a slip, stair and ramp tops that miss the
 * surface they hang from, path pieces and bridges that step or stop short
 * where they meet an edge or door, and doors with stairs running straight
 * from the sill. Each item may carry a fix, as data (levels-fixes turns
 * fixes into param patches). Pure.
 */

const FT = 0.3048
const IN = 0.0254
/** A wing level at or above this is an intentional upper floor, feet. */
export const UPPER_FLOOR_FT = 4.5

export interface MassInfo {
  readonly mi: number
  readonly name: string
  readonly kind: string
  /** Level above the building floor, feet. */
  readonly lvl: number
  readonly access: boolean
}

export type LevelFix =
  /** Put wing mi of a building on level `lvl` (feet). */
  | { readonly type: 'setLvl'; readonly host: ObjectId; readonly mi: number; readonly lvl: number }
  /** Pin a piece end's level to z (metres). */
  | { readonly type: 'setEnds'; readonly piece: ObjectId; readonly end: 'A' | 'B'; readonly z: number }
  /** Move a piece so its end lands on the edge point (x, n) and pin its level to z. */
  | {
      readonly type: 'snapEnd'
      readonly piece: ObjectId
      readonly end: 'A' | 'B'
      readonly x: number
      readonly n: number
      readonly z: number
      readonly edge: { readonly mi: number; readonly i: number }
    }

export type LevelCode = 'wing-level' | 'wing-top' | 'piece-step' | 'piece-gap' | 'bridge-step' | 'door-landing'

export interface LevelItem {
  readonly code: LevelCode
  readonly what: string
  readonly mi: number
  readonly dzIn: number
  readonly gapIn?: number
  readonly junction?: Junction
  readonly fix: LevelFix | null
}

export interface LevelReport {
  readonly ok: boolean
  readonly name: string
  readonly items: readonly LevelItem[]
}

export interface LevelInfo {
  readonly hostId: ObjectId
  readonly name: string
  readonly masses: readonly MassInfo[]
  readonly junctions: readonly Junction[]
}

/** Whole inches, as the report words a step: "6 in". */
const inTxt = (dz: number) => `${Math.round(Math.abs(dz) / IN)} in`

/** Metres → "6 in", "6½ in", "2 ft 3 in" (absolute value, to the half inch). */
export function fmtIn(m: number): string {
  const r = Math.round((Math.abs(m || 0) / IN) * 2) / 2
  if (r >= 24) {
    let ft = Math.floor(r / 12)
    let inch = Math.round(r - ft * 12)
    if (inch === 12) {
      ft++
      inch = 0
    }
    return `${ft} ft${inch ? ` ${inch} in` : ''}`
  }
  const w = Math.floor(r)
  const half = r - w > 0
  return `${w || !half ? String(w) : ''}${half ? '½' : ''} in`
}

/** "+6 in" / "−2½ in"; under a quarter inch reads "+0 in". */
export function fmtSigned(m: number): string {
  const a = Math.abs(m || 0) / IN
  return `${a < 0.25 || m > 0 ? '+' : '−'}${fmtIn(m)}`
}

const isWing = (j: Junction) => j.kind === 'stair-wing' || j.kind === 'ramp-wing'
const below = (dz: number) => (dz < 0 ? ' below ' : ' above ')

function wingLevelItems(ms: readonly MassInfo[], hostId: ObjectId, mname: (mi: number) => string): LevelItem[] {
  const mainLvl = ms.length ? ms[0].lvl || 0 : 0
  return ms.flatMap((m): LevelItem[] => {
    if (m.mi === 0 || m.access) return []
    const lv = m.lvl || 0
    const d = (lv - mainLvl) * FT
    if (Math.abs(d) <= LEVEL_M || lv >= UPPER_FLOOR_FT) return []
    return [{ code: 'wing-level', what: `${mname(m.mi)} is ${inTxt(d)}${d > 0 ? ' above' : ' below'} the main floor`, mi: m.mi, dzIn: d / IN, fix: { type: 'setLvl', host: hostId, mi: m.mi, lvl: mainLvl } }]
  })
}

function wingTopItems(info: LevelInfo, mname: (mi: number) => string): LevelItem[] {
  const ms = info.masses
  const mainLvl = ms.length ? ms[0].lvl || 0 : 0
  return info.junctions.flatMap((j): LevelItem[] => {
    if (!isWing(j) || Math.abs(j.dz) <= LEVEL_M) return []
    const mi = j.other.mi ?? 0
    const host = ms.find((q) => q.mi === j.edge.mi)
    return [{ code: 'wing-top', what: `${j.name || mname(mi)} top is ${inTxt(j.dz)}${below(j.dz)}${mname(j.edge.mi)}`, mi, dzIn: j.dz / IN, junction: j, fix: { type: 'setLvl', host: info.hostId, mi, lvl: host ? host.lvl || 0 : mainLvl } }]
  })
}

function pieceFix(j: Junction, gap: boolean): LevelFix | null {
  const end = j.other.end
  if (j.kind !== 'piece' || !end) return null
  if (gap) return { type: 'snapEnd', piece: j.other.id, end, x: j.at[0], n: j.at[1], z: j.zHere, edge: { mi: j.edge.mi, i: j.edge.i } }
  return j.pieceKind && j.pieceKind !== 'walk' ? { type: 'setEnds', piece: j.other.id, end, z: j.zHere } : null
}

function pieceItems(J: readonly Junction[], mname: (mi: number) => string): LevelItem[] {
  return J.flatMap((j): LevelItem[] => {
    if (j.kind !== 'piece' && j.kind !== 'bridge') return []
    const step = Math.abs(j.dz) > LEVEL_M
    const gap = j.gapM > GAP_M
    if (!step && !gap) return []
    const here = j.door ? j.door.label || 'the door' : j.label || mname(j.edge.mi)
    const nm = `${j.name || 'piece'}${j.other.end ? ` end ${j.other.end}` : ''}`
    const gapTxt = `${Math.round(j.gapM / IN)} in`
    let what = nm + (step ? ` is ${inTxt(j.dz)}${below(j.dz)}${here}` : ` stops ${gapTxt} short of ${here}`)
    if (step && gap) what += ` (${gapTxt} gap)`
    const code: LevelCode = j.kind === 'bridge' ? 'bridge-step' : step ? 'piece-step' : 'piece-gap'
    return [{ code, what, mi: j.edge.mi, dzIn: j.dz / IN, gapIn: j.gapM / IN, junction: j, fix: pieceFix(j, gap) }]
  })
}

function doorLandingItems(J: readonly Junction[]): LevelItem[] {
  return J.flatMap((j): LevelItem[] => {
    if (!j.door) return []
    const runs = isWing(j) || (j.kind === 'piece' && (j.pieceKind === 'stair' || j.pieceKind === 'ramp'))
    if (!runs) return []
    const name = j.name || 'stairs'
    return [{ code: 'door-landing', what: `${j.door.label || 'Door'}: ${name} start${/s$/.test(name) ? '' : 's'} at the sill — no level landing within 0.3 m`, mi: j.edge.mi, dzIn: j.dz / IN, junction: j, fix: null }]
  })
}

/** The level report from a building's masses and junctions (legacy levelReportFor). */
export function levelReportFor(info: LevelInfo): LevelReport {
  const ms = info.masses
  const mname = (mi: number) => {
    const m = ms.find((q) => q.mi === mi)
    return m ? m.name || (mi === 0 ? 'main floor' : `${m.kind || 'wing'} ${mi}`) : `mass ${mi}`
  }
  const items = [...wingLevelItems(ms, info.hostId, mname), ...wingTopItems(info, mname), ...pieceItems(info.junctions, mname), ...doorLandingItems(info.junctions)]
  return { ok: !items.length, name: info.name || 'Building', items }
}

/** A building's masses as the report reads them. */
export function massInfos(o: PlanObject): MassInfo[] {
  return buildingMasses(o.params).map((m, mi) => ({ mi, name: massLabel(o, m, mi), kind: m.kind, lvl: m.lvl, access: m.kind === 'stair' || m.kind === 'ramp' }))
}

/** The level report of a building on the site (legacy levelReport); ok and empty for anything else. */
export function levelReport(o: PlanObject, objects: readonly PlanObject[], terrain: Terrain, ground: Ground, junctions?: readonly Junction[]): LevelReport {
  if (o.type !== 'house') return { ok: true, name: o.name || o.type, items: [] }
  return levelReportFor({ hostId: o.id, name: o.name || o.type, masses: massInfos(o), junctions: junctions ?? siteJunctions(o, objects, terrain, ground) })
}
