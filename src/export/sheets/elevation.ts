import { localToSite, type LocalPoint } from '../../buildings/footprint'
import { groundWithCuts, type Ground } from '../../site/earthworks'
import { elevationAt } from '../../site/terrain'
import type { Terrain } from '../../site/types'
import { ftToM, mToFt } from '../../site/units'
import { sunkCuts } from '../../scene/placement'
import type { PlanObject } from '../../store/types'
import { partLevels } from './levels'
import { partPoints } from './parts'
import { sideDepth, sideU } from './sides'
import type { ElevationSide, ElevationView, SheetBuilding } from './types'

/** The lowest grade along this view's nearest faces, not the lowest under the whole building (the Levels table's). */
export const GRADE_LOW_LABEL = 'Grade, lowest in this view'
/** Grade is read along the view this often, feet. */
const GRADE_STEP_FT = 1
/** Levels closer than this are one line on the drawing, feet (1 in). */
const SAME_LEVEL_FT = 1 / 12

/** The building-frame point at horizontal u and depth on a side's view, the inverse of sideU and sideDepth. */
export function fromSide(side: ElevationSide, u: number, depth: number): LocalPoint {
  if (side === 'front') return [u, depth]
  if (side === 'right') return [depth, -u]
  if (side === 'back') return [-u, -depth]
  return [-depth, u]
}

/** Depth of the face nearest the viewer at u: the largest crossing of any part's outline, or the nearest point overall. */
function nearestDepth(b: SheetBuilding, side: ElevationSide, u: number, fallback: number): number {
  let best = -Infinity
  for (const p of b.parts) {
    p.outline.forEach((a, i) => {
      const c = p.outline[(i + 1) % p.outline.length]
      const ua = sideU(side, a)
      const uc = sideU(side, c)
      if (Math.abs(uc - ua) < 1e-9 || u < Math.min(ua, uc) || u > Math.max(ua, uc)) return
      const t = (u - ua) / (uc - ua)
      best = Math.max(best, sideDepth(side, a) + (sideDepth(side, c) - sideDepth(side, a)) * t)
    })
  }
  return Number.isFinite(best) ? best : fallback
}

function sampleU(uMin: number, uMax: number): number[] {
  const n = Math.max(1, Math.ceil((uMax - uMin) / GRADE_STEP_FT - 1e-9))
  return Array.from({ length: n + 1 }, (_, k) => Math.min(uMax, uMin + k * GRADE_STEP_FT))
}

/** The finished grade along the view's nearest faces, and the survey under it, as (u, y). */
function gradeAlong(o: PlanObject, b: SheetBuilding, side: ElevationSide, terrain: Terrain, ground: Ground, uMin: number, uMax: number) {
  const floorM = ftToM(b.levels.floorNavdFt)
  const near = Math.max(...b.parts.flatMap((p) => p.outline.map((q) => sideDepth(side, q))))
  const at = sampleU(uMin, uMax).map((u) => [u, localToSite(o.position, o.rotation, fromSide(side, u, nearestDepth(b, side, u, near)))] as const)
  return {
    grade: at.map(([u, [x, n]]): [number, number] => [u, mToFt(ground(x, n) - floorM)]),
    survey: at.map(([u, [x, n]]): [number, number] => [u, mToFt(elevationAt(terrain, x, n) - floorM)]),
  }
}

/** Floors, wall tops and roof heights of every part, with the lowest grade; sorted, and lines within 1 in merged. */
function levelsOf(b: SheetBuilding, gradeLow: number | null): ElevationView['levels'] {
  const raw: { label: string; yFt: number }[] = [{ label: 'Floor', yFt: 0 }]
  for (const p of b.parts) raw.push(...partLevels(p))
  if (gradeLow !== null) raw.push({ label: GRADE_LOW_LABEL, yFt: gradeLow })
  const sorted = [...raw].sort((a, c) => a.yFt - c.yFt)
  return sorted.reduce<{ label: string; yFt: number }[]>((out, l) => {
    const last = out[out.length - 1]
    if (last && l.yFt - last.yFt < SAME_LEVEL_FT) {
      return last.label.split(' / ').includes(l.label) ? out : [...out.slice(0, -1), { ...last, label: `${last.label} / ${l.label}` }]
    }
    return [...out, l]
  }, [])
}

/** One elevation of a building, as seen from outside the given side. */
export function elevationView(objects: readonly PlanObject[], terrain: Terrain, b: SheetBuilding, side: ElevationSide): ElevationView {
  const us = b.parts.flatMap(partPoints).map((q) => sideU(side, q))
  const uMin = us.length ? Math.min(...us) : 0
  const uMax = us.length ? Math.max(...us) : 0
  const o = objects.find((x) => x.id === b.id)
  const visible = objects.filter((x) => !x.hidden)
  const ground = groundWithCuts(terrain, sunkCuts(visible, terrain))
  const { grade, survey } = o && b.parts.length ? gradeAlong(o, b, side, terrain, ground, uMin, uMax) : { grade: [], survey: [] }
  const spans = b.parts.map((p) => {
    const pu = p.outline.map((q) => sideU(side, q))
    return { name: p.name, u0: Math.min(...pu), u1: Math.max(...pu) }
  })
  return {
    side,
    uMin,
    uMax,
    grade,
    survey,
    levels: levelsOf(b, grade.length ? Math.min(...grade.map((g) => g[1])) : null),
    spans,
  }
}
