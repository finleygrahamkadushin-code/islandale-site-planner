import { buildingMasses, partName } from '../buildings/masses'
import { railOwner, surfaceZ } from '../buildings/rails/railWorld'
import type { Ground } from '../site/earthworks'
import type { Terrain } from '../site/types'
import type { PlanObject } from '../store/types'
import { isFlush, LEVEL_M, sameJunction, type Junction } from './junctions'
import { siteJunctions } from './junctionsSite'
import { fmtIn, fmtSigned, levelReport, UPPER_FLOOR_FT, type LevelFix, type LevelItem, type LevelReport } from './levels'

/**
 * The "Levels & junctions" inspector block (old level-floors panelModel
 * and rowHTML), as rows of text with a severity and an index into the
 * fixes, so Fix and Level everything know what to apply. Pure.
 */

const FT = 0.3048
const IN = 0.0254

export type Severity = 'ok' | 'warn'

export interface LevelRow {
  readonly label: string
  /** The bold part after " · " ("flush", "6 in low"); empty for none. */
  readonly text: string
  readonly ok: boolean
  readonly severity: Severity
  /** Index into the model's fixes, or −1 for no Fix button. */
  readonly fix: number
}

export interface LevelsPanel {
  readonly name: string
  /** Main walking surface, metres NAVD88. */
  readonly floorM: number
  readonly ok: boolean
  readonly wings: readonly LevelRow[]
  readonly junctions: readonly LevelRow[]
  readonly others: readonly LevelRow[]
  readonly fixes: readonly LevelFix[]
}

export const LEVELS_TITLE = 'Levels & junctions'
export const NOTHING_MEETS_TEXT = 'Nothing meets this building’s edges yet.'
export const LEVELS_HINT = 'Flush = within ½ in (13 mm). Fix sets a piece’s end to the surface it meets; Level everything fixes them all in one undo step.'
export const LEVEL_EVERYTHING = 'Level everything'

const row = (label: string, text: string, ok: boolean, fix: number): LevelRow => ({ label, text, ok, severity: ok ? 'ok' : 'warn', fix })

/** "flush", "6 in low", "6 in high", or "2 in gap". */
export function junctionText(j: Pick<Junction, 'dz' | 'gapM'>): string {
  if (isFlush(j)) return 'flush'
  if (Math.abs(j.dz) > LEVEL_M) return `${fmtIn(j.dz)}${j.dz < 0 ? ' low' : ' high'}`
  return `${fmtIn(j.gapM)} gap`
}

/** "Main floor · el. 12.3 ft". */
export const floorText = (floorM: number): string => `el. ${(floorM / FT).toFixed(1)} ft`
export const statusText = (p: Pick<LevelsPanel, 'ok'>): string => (p.ok ? 'all flush' : 'steps found')
/** A row as one line: "Elders’ walk → door · 6 in low". */
export const rowText = (r: LevelRow): string => (r.text ? `${r.label} · ${r.text}` : r.label)

const isWingJ = (j: Junction | undefined) => !!j && (j.kind === 'stair-wing' || j.kind === 'ramp-wing')
const dzOf = (it: LevelItem | undefined) => (it ? it.dzIn * IN : 0)

/** The panel from a building's report and junctions (legacy panelModel). */
export function panelModel(o: PlanObject, report: LevelReport, J: readonly Junction[], floorM: number): LevelsPanel {
  const items = report.items
  const used = new Set<LevelItem>()
  const fixes: LevelFix[] = []
  const take = (it: LevelItem): number => {
    used.add(it)
    if (!it.fix) return -1
    fixes.push(it.fix)
    return fixes.length - 1
  }
  const wings = buildingMasses(o.params).flatMap((m, mi): LevelRow[] => {
    if (!mi) return []
    const acc = m.kind === 'stair' || m.kind === 'ramp'
    const it = items.find((q) => q.mi === mi && !used.has(q) && (!q.junction || (acc && (q.code === 'wing-top' || isWingJ(q.junction)))))
    const fix = it ? take(it) : -1
    if (acc) {
      const d = dzOf(it)
      return [row(partName(m, mi), !it ? 'top flush' : Math.abs(d) > 0 ? `top ${fmtIn(d)}${d < 0 ? ' below' : ' above'} the surface` : 'top not flush', !it, fix)]
    }
    if (m.lvl >= UPPER_FLOOR_FT) return [row(partName(m, mi), `upper floor · +${Math.round(m.lvl * 10) / 10} ft`, !it, fix)]
    const off = m.lvl * FT
    const level = !it && Math.abs(off) <= LEVEL_M
    return [row(partName(m, mi), `${fmtSigned(off)} · ${level ? 'level' : 'not level'}`, !it && Math.abs(off) <= LEVEL_M, fix)]
  })
  const junctions = J.map((j) => {
    const mine = items.filter((q) => !used.has(q) && q.junction && sameJunction(q.junction, j))
    const it = mine.find((q) => q.fix) ?? mine[0]
    const label = `${j.name} → ${j.door ? j.door.label : j.label}`
    return it ? row(label, junctionText(j), false, take(it)) : row(label, junctionText(j), isFlush(j), -1)
  })
  const others = items.filter((it) => !used.has(it)).map((it) => row(it.what, '', false, take(it)))
  return { name: o.name || 'Building', floorM, ok: report.ok && !items.length, wings, junctions, others, fixes }
}

/** The panel for a building on the site; null for anything that is not a building. */
export function levelsPanel(o: PlanObject, objects: readonly PlanObject[], terrain: Terrain, ground: Ground): LevelsPanel | null {
  const owner = o.type === 'house' ? railOwner(o, terrain, ground) : null
  if (!owner) return null
  const J = siteJunctions(o, objects, terrain, ground)
  return panelModel(o, levelReport(o, objects, terrain, ground, J), J, surfaceZ(owner, owner.masses[0]))
}
