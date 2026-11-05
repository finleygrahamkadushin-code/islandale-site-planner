import { beforeAll, describe, expect, test } from 'vitest'
import { pointInPolygon } from '../../buildings/foundation'
import type { LocalPoint } from '../../buildings/footprint'
import type { MeshData } from '../../buildings/geom'
import { buildingMasses, buildingToMass, massPoly, type Mass } from '../../buildings/masses'
import { buildRoof, normaliseRoof, roofParamsOf, ROOF_TYPES, sculptOptionsOf, tipColumnTop } from '../../buildings/roof'
import { isSculpted, sculptedRoof } from '../../buildings/sculptRoof'
import { buildingLook } from '../../scene/buildingLook'
import { roofFinish } from '../../scene/RoofMesh'
import { ftToM, mToFt } from '../../site/units'
import { usePlanStore } from '../../store/planStore'
import type { PlanObject } from '../../store/types'
import { partLevels } from './levels'
import { sheetBuildings } from './model'
import { sheetRoof } from './roofs'
import { sheetTables } from './table'
import type { SheetBuilding, SheetRoof } from './types'

/**
 * The roof on the sheets is the scene's roof: the same rise for every
 * roofed part of every scheme, and for parts built in code of every roof
 * type on every footprint shape, turned any way; its levels named by type,
 * its plan linework and slope arrow true to the 3D roof.
 */

const store = () => usePlanStore.getState()
const objects = (): PlanObject[] => store().plan.order.map((id) => store().plan.objects[id])
const SHAPES = ['rect', 'oct', 'trap', 'para', 'ellipse', 'kidney', 'teardrop', 'blob', 'ribbon'] as const
const TYPES = ROOF_TYPES.filter((t) => t !== 'none')
const TURNS = [0, 37, 200]

/** The rise the scene's RoofMesh draws, in feet: its finish chooser, its parameters and its builder. */
function sceneRiseFt(o: PlanObject, m: Mass, mi: number): number {
  const finish = roofFinish(buildingLook(o, 'realistic', 0), mi).finish
  const params = roofParamsOf(m, finish)
  const poly = massPoly(m)
  return mToFt(isSculpted(normaliseRoof(m.roof)) ? sculptedRoof(poly, sculptOptionsOf(params)).rise : buildRoof(poly, params).rise)
}

/** Highest point of a mesh straight above (x, z), metres, or null. */
function heightAt(mesh: MeshData, x: number, z: number): number | null {
  const p = mesh.positions
  let best: number | null = null
  for (let i = 0; i + 8 < p.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = p.slice(i, i + 9)
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
    if (Math.abs(det) < 1e-12) continue
    const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det
    const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det
    if (l1 < -1e-6 || l2 < -1e-6 || 1 - l1 - l2 < -1e-6) continue
    const y = l1 * ay + l2 * by + (1 - l1 - l2) * cy
    if (best === null || y > best) best = y
  }
  return best
}

/** Masses of a cabin whose main walls have the given fields (scheme C's twin pod with its wings taken off). */
function mainMass(fields: Record<string, unknown>): Mass {
  const base = store().plan.objects['C-2']
  return buildingMasses({ ...base.params, pts: undefined, wings: [], cuts: [], ...fields })[0]
}

/** A cabin on scheme C's twin-pod spot, its own params replaced, turned as given. */
function cabin(params: Record<string, unknown>, rotation = 0): SheetBuilding {
  const base = store().plan.objects['C-2']
  const o: PlanObject = { ...base, rotation, params: { ...base.params, pts: undefined, wings: [], cuts: [], ...params } }
  const b = sheetBuildings([o], store().site.terrain)[0]
  if (!b) throw new Error('no sheet building')
  return b
}

const levelOf = (r: SheetRoof, label: string) => {
  const l = r.levels.find((x) => x.label === label)
  if (!l) throw new Error(`no level ${label} in ${r.levels.map((x) => x.label).join(', ')}`)
  return l.riseFt
}
const within = (p: LocalPoint, poly: readonly LocalPoint[], tol: number) =>
  pointInPolygon(poly, p[0], p[1]) || poly.some((a, i) => {
    const b = poly[(i + 1) % poly.length]
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)))
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz)) < tol
  })

beforeAll(() => {
  store().setReadOnly(null)
  store().loadScheme('C')
})

describe('the roof rise is the scene’s', () => {
  test('for every roofed part of every scheme, and the building’s top is its highest roof', () => {
    let checked = 0
    for (const s of store().schemes) {
      store().loadScheme(s.id)
      const objs = objects()
      for (const b of sheetBuildings(objs, store().site.terrain)) {
        const o = objs.find((x) => x.id === b.id)
        if (!o || o.type !== 'house') continue
        const masses = buildingMasses(o.params)
        for (const p of b.parts) {
          if (!p.roof) continue
          expect(p.roof.riseFt, `${b.id} ${p.name}`).toBeCloseTo(sceneRiseFt(o, masses[p.massIndex], p.massIndex), 6)
          // the roof's highest named level is its top
          expect(Math.max(...p.roof.levels.map((l) => l.riseFt))).toBeCloseTo(p.roof.riseFt, 6)
          checked++
        }
        expect(b.levels.topFt).toBeCloseTo(Math.max(0, ...b.parts.map((p) => p.levelFt + p.wallFt + (p.roof?.riseFt ?? 0))), 9)
      }
    }
    expect(checked).toBeGreaterThan(100)
    store().loadScheme('C')
  })

  test('with the shell curl and the finish: D-0’s copper shell and F-0’s glass dome', () => {
    const rise = (scheme: string, id: string, name: string) => {
      store().loadScheme(scheme)
      const p = sheetBuildings(objects(), store().site.terrain).find((b) => b.id === id)?.parts.find((q) => q.name === name)
      return p?.roof?.riseFt ?? NaN
    }
    expect(rise('D', 'D-0', 'Main')).toBeCloseTo(13.54, 2)
    expect(rise('F', 'F-0', 'Wing 2')).toBeCloseTo(4.23, 2)
    store().loadScheme('C')
  })

  test('for parts built in code: every roof type on every shape', () => {
    for (const roof of TYPES) {
      for (const shape of SHAPES) {
        const m = mainMass({ shape, w: 30, d: 20, h: 10, roof, pitch: 7, ridge: 'x', overhang: 1.5, curl: 0.8 })
        const r = sheetRoof(m, null)
        if (!r) throw new Error(`no roof ${roof} ${shape}`)
        const params = roofParamsOf(m, null)
        const scene = isSculpted(normaliseRoof(roof)) ? sculptedRoof(massPoly(m), sculptOptionsOf(params)).rise : buildRoof(massPoly(m), params).rise
        expect(r.riseFt, `${roof} on ${shape}`).toBeCloseTo(mToFt(scene), 9)
        const levels = r.levels.map((l) => l.riseFt)
        expect(levels).toEqual([...levels].sort((a, b) => a - b))
        expect(Math.max(...levels)).toBeCloseTo(r.riseFt, 9)
        // linework lies on the 3D roof (on a ribbon a sculpted slab reaches a little past its eave, and its lines with it)
        const top = buildRoof(massPoly(m), params).roof
        const onRoof = (q: LocalPoint) => {
          const [x, z] = buildingToMass(m, q)
          return within(q, r.eave, 0.05) || heightAt(top, x * 0.3048, z * 0.3048) !== null
        }
        for (const l of r.lines) for (const q of l.pts) expect(onRoof(q), `${roof} on ${shape}: ${l.kind}`).toBe(true)
      }
    }
  })
})

describe('roof levels are named by type', () => {
  const rect = (fields: Record<string, unknown>) => {
    const r = sheetRoof(mainMass({ shape: 'rect', w: 30, d: 20, h: 10, pitch: 8, ridge: 'x', overhang: 1, ...fields }), null)
    if (!r) throw new Error('no roof')
    return r
  }

  test('gambrel: its break and ridge, both slopes, a ridge and two break lines', () => {
    const r = rect({ roof: 'gambrel' })
    // the knuckle at a quarter of the 22 ft span, 0.72 of the way up a ridge 1.3 times a gable's
    const ridge = 1.3 * (8 / 12) * 11
    expect(r.levels.map((l) => l.label)).toEqual(['eave', 'gambrel break', 'ridge'])
    expect(levelOf(r, 'ridge')).toBeCloseTo(ridge, 6)
    expect(levelOf(r, 'gambrel break')).toBeCloseTo(0.72 * ridge, 6)
    expect(r.slopes).toBe('14.98:12 / 5.82:12')
    expect(r.lines.filter((l) => l.kind === 'ridge')).toHaveLength(1)
    expect(r.lines.filter((l) => l.kind === 'break')).toHaveLength(2)
  })

  test('gable: one ridge the eave’s length along the ridge axis, at the rise', () => {
    for (const ridge of ['x', 'z'] as const) {
      const r = rect({ roof: 'gable', ridge })
      expect(r.levels.map((l) => l.label)).toEqual(['eave', 'ridge'])
      const lines = r.lines.filter((l) => l.kind === 'ridge')
      expect(lines).toHaveLength(1)
      const [a, b] = [lines[0].pts[0], lines[0].pts[lines[0].pts.length - 1]]
      const along = ridge === 'x' ? 0 : 1
      expect(Math.abs(b[along] - a[along])).toBeCloseTo(ridge === 'x' ? 32 : 22, 6)
      expect(Math.abs(b[1 - along] - a[1 - along])).toBeCloseTo(0, 6)
      expect(r.slopes).toBe('8:12')
    }
  })

  test('hip: a ridge of the eave’s length less its span, and four hips', () => {
    const r = rect({ roof: 'hip' })
    const ridge = r.lines.filter((l) => l.kind === 'ridge')
    expect(ridge).toHaveLength(1)
    const p = ridge[0].pts
    expect(Math.hypot(p[p.length - 1][0] - p[0][0], p[p.length - 1][1] - p[0][1])).toBeCloseTo(32 - 22, 6)
    const hipEnds = r.lines.filter((l) => l.kind === 'hip').flatMap((l) => [l.pts[0], l.pts[l.pts.length - 1]])
    for (const corner of r.eave) expect(hipEnds.some((q) => Math.hypot(q[0] - corner[0], q[1] - corner[1]) < 1e-6)).toBe(true)
  })

  test('shed: low and high eave, and an arrow from the high side down to the low', () => {
    for (const ridge of ['x', 'z'] as const) {
      const m = mainMass({ shape: 'rect', w: 30, d: 20, h: 10, pitch: 3, ridge, overhang: 1, roof: 'shed' })
      const r = sheetRoof(m, null)
      if (!r?.slope) throw new Error('no slope arrow')
      expect(r.levels.map((l) => l.label)).toEqual(['low eave', 'high eave'])
      expect(r.lines).toHaveLength(0)
      const mesh = buildRoof(massPoly(m), roofParamsOf(m, null)).roof
      const y = (p: LocalPoint) => heightAt(mesh, (p[0] - m.dx) * 0.3048, (p[1] - m.dz) * 0.3048) ?? NaN
      expect(y(r.slope.high)).toBeGreaterThan(y(r.slope.low))
      // roof.ts: the high side is local -z for a ridge along x, -x for one along z
      expect(ridge === 'x' ? r.slope.high[1] < r.slope.low[1] : r.slope.high[0] < r.slope.low[0]).toBe(true)
    }
  })

  test('butterfly: its valley (at the wall top on a rectangle, 0.25 m up on a fitted outline) and its eaves', () => {
    const r = rect({ roof: 'butterfly' })
    expect(r.levels.map((l) => l.label)).toEqual(['valley', 'eaves'])
    expect(levelOf(r, 'valley')).toBeCloseTo(0, 9)
    expect(r.lines.filter((l) => l.kind === 'valley')).toHaveLength(1)
    const fitted = sheetRoof(mainMass({ shape: 'oct', w: 24, d: 24, h: 10, pitch: 3, ridge: 'x', overhang: 1, roof: 'butterfly' }), null)
    expect(fitted && levelOf(fitted, 'valley')).toBeCloseTo(mToFt(0.25), 6)
  })

  test('flat, pyramid, dome, vault, shell and saddle', () => {
    const flat = rect({ roof: 'flat' })
    expect(flat.levels.map((l) => l.label)).toEqual(['eave', 'roof top'])
    expect(flat.slopes).toBe('flat')
    expect(rect({ roof: 'pyramid' }).levels.map((l) => l.label)).toEqual(['eave', 'apex'])
    for (const roof of ['dome', 'vault', 'sod']) expect(rect({ roof }).levels.map((l) => l.label)).toEqual(['eave', 'crown'])
    const shell = rect({ roof: 'shell', curl: 0.85 })
    expect(shell.levels.map((l) => l.label).slice(0, 3)).toEqual(['eave, low end', 'lip, underside', 'lip, top'])
    expect(levelOf(shell, 'lip, top')).toBeGreaterThan(levelOf(shell, 'lip, underside'))
    expect(shell.lines.some((l) => l.kind === 'lip')).toBe(true)
    expect(shell.slopes).toBe('curved, curl 0.85')
    const saddle = rect({ roof: 'saddle' })
    expect(saddle.levels.map((l) => l.label).slice(0, 3)).toEqual(['low corners', 'high corners, underside', 'high corners, top'])
    expect(rect({ roof: 'dome' }).lines.some((l) => l.kind === 'contour')).toBe(true)
    expect(rect({ roof: 'vault' }).lines.some((l) => l.kind === 'crown')).toBe(true)
  })

  test('a wall with no roof marks its wall top; a porch roof names its own eave', () => {
    const b = cabin({ shape: 'rect', w: 20, d: 16, h: 9, roof: 'none', wings: [{ kind: 'porch', open: true, dx: 0, dz: 12, w: 12, d: 6, h: 8, roof: 'shed', pitch: 2, ridge: 'x', overhang: 1 }] })
    expect(partLevels(b.parts[0]).map((l) => l.label)).toEqual(['Main wall top'])
    expect(partLevels(b.parts[1]).map((l) => l.label)).toEqual(['Porch 1 low eave', 'Porch 1 high eave'])
  })
})

describe('turned parts', () => {
  test('a turned wing’s linework and slope arrow turn with it', () => {
    for (const roof of ['gable', 'hip', 'gambrel', 'shed', 'pyramid', 'shell']) {
      const wing = (rot: number) => ({ kind: 'wall', dx: 30, dz: 4, rot, w: 18, d: 12, h: 9, shape: 'rect', roof, pitch: 6, ridge: 'x', overhang: 1, curl: 0.7 })
      const at = (rot: number, turn: number) => {
        const b = cabin({ shape: 'rect', w: 20, d: 16, h: 9, roof: 'gable', wings: [wing(rot)] }, turn)
        const masses = buildingMasses({ ...store().plan.objects['C-2'].params, pts: undefined, wings: [wing(rot)], cuts: [], shape: 'rect', w: 20, d: 16, h: 9, roof: 'gable' })
        const r = b.parts[1].roof
        if (!r) throw new Error('no wing roof')
        const own = (p: LocalPoint) => buildingToMass(masses[1], p).map((v) => Math.round(v * 1000) / 1000 + 0)
        return { lines: r.lines.map((l) => ({ kind: l.kind, pts: l.pts.map(own) })), slope: r.slope ? [own(r.slope.high), own(r.slope.low)] : null, levels: r.levels }
      }
      const square = at(0, 0)
      for (const rot of TURNS) {
        for (const turn of TURNS) {
          const turned = at(rot, turn)
          expect(turned.levels, `${roof} at ${rot}`).toEqual(square.levels)
          expect(turned.slope).toEqual(square.slope)
          expect(turned.lines.map((l) => l.kind).sort()).toEqual(square.lines.map((l) => l.kind).sort())
          if (roof !== 'shell') expect(turned.lines).toEqual(square.lines)
        }
      }
    }
  })
})

describe('scheme C', () => {
  test('C4’s shell prow: its dipped tip eave, top and underside, and the tip column on the plan', () => {
    store().loadScheme('C4')
    const o = objects().find((x) => x.id === 'C4-0')
    const b = sheetBuildings(objects(), store().site.terrain).find((x) => x.id === 'C4-0')
    if (!o || !b) throw new Error('no C4-0')
    const m = buildingMasses(o.params)[0]
    const r = b.parts[0].roof
    if (!r?.tip) throw new Error('no tip column')
    const built = buildRoof(massPoly(m), roofParamsOf(m, null))
    if (!built.tip) throw new Error('no 3D tip')
    expect(levelOf(r, 'tip eave')).toBeCloseTo(-(m.roofDip ?? 0), 2)
    expect(levelOf(r, 'tip eave') - levelOf(r, 'tip eave, underside')).toBeCloseTo(mToFt(0.2), 6)
    expect(levelOf(r, 'tip column top')).toBeCloseTo(mToFt(tipColumnTop(built.tip, ftToM(m.h))), 9)
    expect(r.tip.topFt).toBeCloseTo(levelOf(r, 'tip column top'), 9)
    expect(buildingToMass(m, r.tip.at)[0]).toBeCloseTo(mToFt(built.tip.x), 6)
    expect(buildingToMass(m, r.tip.at)[1]).toBeCloseTo(mToFt(built.tip.z), 6)
    expect(levelOf(r, 'ridge')).toBeCloseTo(9.625, 3)
    // the tip column stands under the roof, and the Levels table lists the tip
    expect(within(r.tip.at, r.eave, 0)).toBe(true)
    const levels = sheetTables(b).find((t) => t.title === 'Levels')
    expect(levels?.rows.map((row) => row[0])).toEqual(expect.arrayContaining(['Main tip eave', 'Main tip eave, underside', 'Main tip column top', 'Main ridge']))
    store().loadScheme('C')
  })

  test('C’s prow draws its ridge and hips; its sheds an arrow; its pods their hips and valley', () => {
    store().loadScheme('C')
    const b = sheetBuildings(objects(), store().site.terrain)
    const roof = (id: string, name: string) => {
      const r = b.find((x) => x.id === id)?.parts.find((p) => p.name === name)?.roof
      if (!r) throw new Error(`no ${id} ${name}`)
      return r
    }
    expect(roof('C-0', 'Main').lines.some((l) => l.kind === 'ridge')).toBe(true)
    expect(roof('C-0', 'Main').lines.some((l) => l.kind === 'hip')).toBe(true)
    expect(roof('C-0', 'Porch 4').slope).not.toBeNull()
    expect(roof('C-1', 'Main').lines.filter((l) => l.kind === 'hip').length).toBeGreaterThan(0)
    expect(roof('C-2', 'Main').lines.filter((l) => l.kind === 'valley')).toHaveLength(1)
    expect(roof('C-2', 'Main').levels.map((l) => l.label)).toEqual(['valley', 'eaves'])
  })
})
