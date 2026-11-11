import { describe, expect, it } from 'vitest'
import { loadIslandaleTerrain } from '../islandale'
import { loadSchemes, schemeById } from '../schemes'
import type { Terrain } from '../types'
import { mToFt } from '../units'
import { planFromScheme } from '../../store/fromLegacy'
import type { PlanObject } from '../../store/types'
import { averageGradeM, buildingHeight, HEIGHT_LIMIT_FT } from './height'

/** Level ground at 10 m, 41 by 41 samples 2 m apart. */
const flat: Terrain = { lon0: 0, lat0: 0, spacing: 2, nx: 41, ny: 41, x0: -40, n0: -40, z: new Array(41 * 41).fill(10) }

/** A sloping site: ground rises 1 m per 10 m east. */
const slope: Terrain = { ...flat, z: Array.from({ length: 41 * 41 }, (_, k) => 10 + ((k % 41) * 2 - 40) / 10) }

const house = (params: Record<string, unknown>): PlanObject => ({
  id: 'h',
  type: 'house',
  name: 'Test cabin',
  position: { x: 0, n: 0 },
  rotation: 0,
  params: { w: 20, d: 16, h: 9, pitch: 6, overhang: 1, ridge: 'x', ...params },
  locked: false,
  hidden: false,
  labelVisible: true,
})

describe('building height', () => {
  it('measures a gable from grade: walls plus pitch/12 × half the span with overhangs', () => {
    expect(buildingHeight(house({ roof: 'gable' }), flat).ft).toBeCloseTo(9 + 0.5 * 9, 6)
  })

  it('stands a gambrel 1.3 times a gable', () => {
    expect(buildingHeight(house({ roof: 'gambrel' }), flat).ft).toBeCloseTo(9 + 1.3 * 4.5, 6)
  })

  it('reads a flat roof as its slab, and none as the wall top', () => {
    expect(buildingHeight(house({ roof: 'flat' }), flat).ft).toBeCloseTo(9 + mToFt(0.3), 6)
    expect(buildingHeight(house({ roof: 'none' }), flat).ft).toBeCloseTo(9, 6)
  })

  it('takes a dome and a shell from the sculpted roof rise', () => {
    // dome: pitch/12 × min(w, d) / 2 with overhangs, plus its 0.18 m slab
    expect(buildingHeight(house({ roof: 'dome' }), flat).ft).toBeCloseTo(9 + 4.5 + mToFt(0.18), 6)
    // shell (curl 0.5): the vault rise across the ridge, × (0.75 + 0.25), plus its 0.2 m slab tapered to half at the peak
    expect(buildingHeight(house({ roof: 'shell', curl: 0.5 }), flat).ft).toBeCloseTo(9 + 4.5 + mToFt(0.1), 6)
    // a sod finish lays a 0.36 m slab over a dome
    expect(buildingHeight(house({ roof: 'dome', roofMat: 'sod' }), flat).ft).toBeCloseTo(9 + 4.5 + mToFt(0.36), 6)
  })

  it('adds lift above grade', () => {
    expect(buildingHeight(house({ roof: 'gable', lift: 2 }), flat).ft).toBeCloseTo(15.5, 6)
  })

  it('counts a raised porch roof when it stands over the main roof', () => {
    const wing = { kind: 'porch', open: true, w: 8, d: 8, dz: 12, h: 20, roof: 'flat' }
    expect(buildingHeight(house({ roof: 'gable', wings: [wing] }), flat).ft).toBeCloseTo(20 + mToFt(0.3), 6)
  })

  it('measures from average grade, so a cabin on a slope reads taller than from its floor', () => {
    const o = house({ roof: 'gable' })
    const h = buildingHeight(o, slope)
    // the floor sits on the highest corner; the mean ground under the outline is lower
    expect(h.gradeM).toBeCloseTo(10, 6)
    expect(averageGradeM(o, slope)).toBeCloseTo(10, 6)
    expect(h.ft).toBeCloseTo(13.5 + mToFt(10 * 0.3048 / 10), 6)
  })

  it('keeps every Scheme C cabin under 35 ft', () => {
    const terrain = loadIslandaleTerrain()
    const plan = planFromScheme(schemeById(loadSchemes(), 'C'))
    const heights = plan.order.map((id) => plan.objects[id]).filter((o) => o.type === 'house').map((o) => buildingHeight(o, terrain).ft)
    expect(heights).toHaveLength(4)
    for (const ft of heights) {
      expect(ft).toBeGreaterThan(12)
      expect(ft).toBeLessThan(HEIGHT_LIMIT_FT)
    }
  })
})
