import { describe, expect, it } from 'vitest'
import { buildingMasses } from '../../buildings/masses'
import { loadIslandale } from '../islandale'
import { loadSchemes, schemeById } from '../schemes'
import { schemeObjects } from './schemeSummary'
import { schemeThumb } from './thumbPaths'

const site = loadIslandale()
const schemes = loadSchemes()

/** Every x, y pair in a path's data. */
function pathPoints(d: string): [number, number][] {
  const nums = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
  return nums.flatMap((v, i) => (i % 2 === 0 ? [[v, nums[i + 1]] as [number, number]] : []))
}

function box(viewBox: string) {
  const [x, y, w, h] = viewBox.split(' ').map(Number)
  return { x0: x, y0: y, x1: x + w, y1: y + h }
}

describe('scheme thumbnails', () => {
  it('draws the lot as a closed ring and the buffer as open runs', () => {
    const t = schemeThumb(schemeById(schemes, 'C'), site)
    expect(t.lot.startsWith('M')).toBe(true)
    expect(t.lot.endsWith('Z')).toBe(true)
    expect(pathPoints(t.lot)).toHaveLength(site.parcel.ring.length)
    expect(t.buffer.startsWith('M')).toBe(true)
    expect(t.buffer).not.toContain('Z')
  })

  it('draws one outline per cabin mass and a dot per tree', () => {
    for (const scheme of schemes) {
      const objects = schemeObjects(scheme)
      const masses = objects.filter((o) => o.type === 'house').reduce((sum, o) => sum + buildingMasses(o.params).length, 0)
      const standalone = objects.filter((o) => ['deck', 'pool', 'shed', 'shop'].includes(o.type)).length
      const t = schemeThumb(scheme, site)
      expect(t.buildings, scheme.id).toHaveLength(masses + standalone)
      expect(t.trees, scheme.id).toHaveLength(objects.filter((o) => o.type === 'tree' || o.params.tree === true).length)
      expect(t.buildings.every((d) => d.endsWith('Z'))).toBe(true)
    }
  })

  it('keeps everything inside the view box for every scheme', () => {
    for (const scheme of schemes) {
      const t = schemeThumb(scheme, site)
      const b = box(t.viewBox)
      const inside = ([x, y]: [number, number]) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1
      const pts = [t.lot, t.buffer, ...t.buildings, ...t.grounds].flatMap(pathPoints)
      const outside = pts.filter((p) => !inside(p))
      expect(outside, scheme.id).toEqual([])
      expect(t.trees.every((c) => inside([c.cx, c.cy]) && c.r > 0), scheme.id).toBe(true)
    }
  })

  it('puts north up: a point further north has a smaller y', () => {
    const t = schemeThumb(schemeById(schemes, 'C'), site)
    const north = site.parcel.ring.reduce((a, p) => (p[1] > a[1] ? p : a))
    const south = site.parcel.ring.reduce((a, p) => (p[1] < a[1] ? p : a))
    const ys = pathPoints(t.lot).map(([, y]) => y)
    expect(Math.min(...ys)).toBeCloseTo(-north[1], 1)
    expect(Math.max(...ys)).toBeCloseTo(-south[1], 1)
    expect(-north[1]).toBeLessThan(-south[1])
  })

  it('rounds coordinates to 0.1 m', () => {
    const t = schemeThumb(schemeById(schemes, 'D'), site)
    const decimals = (t.buildings.join('').match(/\.\d+/g) ?? []).map((s) => s.length - 1)
    expect(Math.max(0, ...decimals)).toBeLessThanOrEqual(1)
  })
})
