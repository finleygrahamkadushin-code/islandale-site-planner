import { describe, expect, test } from 'vitest'
import { buildingMasses } from '../buildings/masses'
import { buildWallShell, wallThicknessFt } from '../buildings/wallShell'
import { massPoly } from '../buildings/masses'
import { layoutOpenings } from '../buildings/openingLayout'
import { sheetBuildings } from '../export/sheets/model'
import { usePlanStore } from '../store/planStore'
import { crossingHoles } from './wallCrossings'

/**
 * Interior doorways in a part's own wall where it runs across another
 * part's floor are cut through that wall, so they are not walled shut.
 */

const solid = () => wallThicknessFt(null)
const store = () => usePlanStore.getState()

const twoParts = (dx: number, rot = 0) => {
  const wing = { kind: 'wall', shape: 'rect', dx, dz: 0, w: 8, d: 8, h: 9, roof: 'flat', rot }
  const rooms = [
    { id: 1, name: 'Main', type: 'living', pts: [[-10, -5], [9.7, -5], [9.7, 5], [-10, 5]] },
    { id: 2, name: 'Wing', type: 'bedroom', pts: [[9.7, -4], [16, -4], [16, 4], [9.7, 4]] },
  ]
  const openings = [{ id: 3, room: 1, edge: 1, pos: 0.5, width: 3, kind: 'door', flip: false, out: false }]
  return { shape: 'rect', w: 20, d: 10, h: 9, wings: [wing], floors: [{ name: 'Main floor', rooms, openings, furniture: [] }] }
}

describe('doorways in a wall across another part\'s floor', () => {
  test('a door in the main walls where they cross a wing\'s floor gets a door-high hole, 3 ft wide, in that wall only', () => {
    const p = twoParts(12)
    const holes = crossingHoles(p, 0, solid, 9)
    expect(holes).toHaveLength(1)
    const [h] = holes
    expect(h.kind).toBe('door')
    expect(h.u1 - h.u0).toBeCloseTo(3, 5)
    expect(h.v0).toBe(0)
    expect(h.v1).toBeCloseTo(6.75, 5)
    // it is on the main walls' right edge (x = 10), half way along it
    const poly = massPoly(buildingMasses(p)[0])
    const e = h.edge
    expect(poly[e][0]).toBeCloseTo(10, 5)
    expect(poly[(e + 1) % poly.length][0]).toBeCloseTo(10, 5)
    expect(crossingHoles(p, 1, solid, 9)).toEqual([])
  })

  test('a doorway across a curved wall is cut over every chord it spans, as one opening', () => {
    store().loadScheme('D')
    const d1 = store().plan.objects['D-1'].params
    // the gallery's curved wall runs across the three pods' floors
    const holes = crossingHoles(d1, 0, solid, buildingMasses(d1)[0].h)
    const ids = [...new Set(holes.map((h) => h.id))]
    expect(ids.length).toBeGreaterThanOrEqual(3)
    for (const id of ids) {
      const pieces = holes.filter((h) => h.id === id).sort((p, q) => p.u0 - q.u0)
      // the pieces meet end to end round the wall, and the doorway is about a door wide
      pieces.slice(1).forEach((p, i) => expect(p.u0).toBeCloseTo(pieces[i].u1, 6))
      // a doorway the curve only clips at one end opens that stretch, never less than a foot
      expect(pieces[pieces.length - 1].u1 - pieces[0].u0).toBeGreaterThan(0.9)
    }
    // a door wider than a chord takes several
    expect(ids.some((id) => holes.filter((h) => h.id === id).length > 1)).toBe(true)
  })

  test('the shell cuts it: the wall has the hole and no wall face crosses it', () => {
    const p = twoParts(12)
    const m = buildingMasses(p)[0]
    const poly = massPoly(m)
    const extra = crossingHoles(p, 0, solid, m.h)
    const shell = buildWallShell(poly, m.h, layoutOpenings(poly, m.cuts, { wallHeightFt: m.h }).openings, { cap: true, extraHoles: extra })
    expect(shell.holes).toContainEqual(extra[0])
  })

  test('a door on the building\'s outside wall is left to the exterior cuts', () => {
    const p = twoParts(12)
    const floors = [{ ...p.floors[0], openings: [{ id: 4, room: 1, edge: 3, pos: 0.5, width: 3, kind: 'door', flip: false, out: false }] }]
    expect(crossingHoles({ ...p, floors }, 0, solid, 9)).toEqual([])
  })

  test('a window gets its sill, a cased opening is a cut-out, and a turned wing still finds its wall', () => {
    const p = twoParts(12, 90)
    const win = { ...p, floors: [{ ...p.floors[0], openings: [{ id: 5, room: 1, edge: 1, pos: 0.5, width: 2, kind: 'window', flip: false, out: false }] }] }
    expect(crossingHoles(win, 0, solid, 9)[0]).toMatchObject({ kind: 'window', v0: 3, v1: 7 })
    const open = { ...p, floors: [{ ...p.floors[0], openings: [{ id: 6, room: 1, edge: 1, pos: 0.5, width: 4, kind: 'open', flip: false, out: false }] }] }
    expect(crossingHoles(open, 0, solid, 9)[0]).toMatchObject({ kind: 'cutout' })
  })

  test('in every scheme, each interior opening the sheets find in a part\'s wall is cut through it, and scheme C has none', () => {
    for (const scheme of ['C', 'C2', 'C3', 'C4', 'D', 'E', 'F', 'G', 'H', 'I']) {
      store().loadScheme(scheme)
      const objects = store().plan.order.map((k) => store().plan.objects[k])
      const holes = objects.flatMap((o) => (o.type === 'house' ? buildingMasses(o.params).flatMap((m, mi) => crossingHoles(o.params, mi, solid, m.h).map((h) => ({ o, h }))) : []))
      if (scheme.startsWith('C')) expect(holes, scheme).toEqual([])
      for (const b of sheetBuildings(objects, store().site.terrain)) {
        const o = store().plan.objects[b.id]
        b.floors.forEach((f) => {
          for (const op of f.openings.filter((x) => x.inPartWall)) {
            // the hole is cut by some part of that building, over at least most of the opening's width
            const mine = holes.filter((x) => x.o.id === b.id)
            const width = Math.max(0, ...[...new Set(mine.map((x) => x.h.id))].map((id) => mine.filter((x) => x.h.id === id).reduce((s, x) => s + x.h.u1 - x.h.u0, 0)))
            expect(mine.length, `${b.id} ${op.kind} at ${op.a}`).toBeGreaterThan(0)
            expect(width, o.id).toBeGreaterThan(0.9)
          }
        })
      }
    }
  })
})
