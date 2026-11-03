import { beforeEach, describe, expect, test } from 'vitest'
import { addFurniture, addOpening, addRoom, newOpening, setRoom } from '../interiors/edits'
import * as G from '../interiors/geom'
import { readFloors } from '../interiors/model'
import { UPPER_FLOOR_MIN_H } from './interiorActions'
import { usePlanStore } from './planStore'

const store = () => usePlanStore.getState()
const history = () => usePlanStore.temporal.getState()
const PROW = 'C-0'
const floors = (id = PROW) => readFloors(store().plan.objects[id].params)

describe('interior actions', () => {
  beforeEach(() => {
    store().setReadOnly(null)
    store().loadScheme('C')
    store().lockAll(false)
    store().setLayer('buildings', { locked: false })
    history().clear()
  })

  test('renaming a room is one undo step, and undo brings the scheme plan back', () => {
    const before = store().plan
    const room = floors()[0].rooms[0]
    const sel = store().editFloor(PROW, 0, (_p, f, next) => setRoom(f, room.id, { name: 'Mudroom', type: 'mudroom' }, next))
    expect(sel).toEqual({ room: room.id })
    expect(floors()[0].rooms[0]).toMatchObject({ name: 'Mudroom', type: 'mudroom' })
    expect(history().pastStates).toHaveLength(1)
    history().undo()
    expect(store().plan).toBe(before)
  })

  test('a door and a bed are added to a room, each one undo step, with fresh ids', () => {
    const f0 = floors()[0]
    const room = f0.rooms.find((r) => r.type === 'living') ?? f0.rooms[0]
    store().editFloor(PROW, 0, (_p, f, next) => addOpening(f, newOpening(room, 0, 0.5, 'door')!, next))
    const c = G.labelPoint(room.pts)!
    store().editFloor(PROW, 0, (_p, f, next) => addFurniture(f, { type: 'bed-queen', x: c[0], z: c[1], rot: 0, w: 5, d: 6.67, mirror: false }, next))
    const f1 = floors()[0]
    expect(f1.openings).toHaveLength(f0.openings.length + 1)
    expect(f1.furniture).toHaveLength(f0.furniture.length + 1)
    const ids = [...f1.openings, ...f1.furniture, ...f1.rooms].map((x) => x.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(history().pastStates).toHaveLength(2)
  })

  test('a refused edit (a room drawn outside the walls) changes nothing and says why', () => {
    const before = store().plan
    expect(store().editFloor(PROW, 0, (p, f, next) => addRoom(p, 0, f, G.rectPoly(200, 200, 10, 10), 'bedroom', 'Bedroom', next))).toBeNull()
    expect(store().plan).toBe(before)
    expect(store().toast?.text).toMatch(/Nothing left to fill/)
  })

  test('a locked cabin refuses floor-plan edits, as does a locked layer', () => {
    const rename = () => store().editFloor(PROW, 0, (_p, f, next) => setRoom(f, f.rooms[0].id, { name: 'X' }, next))
    store().setLocked(PROW, true)
    const locked = store().plan
    expect(rename()).toBeNull()
    expect(store().addFloor(PROW)).toBeNull()
    expect(store().plan).toBe(locked)
    store().setLocked(PROW, false)
    store().setLayer('buildings', { locked: true })
    const layerLocked = store().plan
    expect(rename()).toBeNull()
    expect(store().plan).toBe(layerLocked)
  })

  test(`an upper floor needs walls of ${UPPER_FLOOR_MIN_H} ft, carries the stair rooms up, and can be removed`, () => {
    expect(store().addFloor(PROW)).toBeNull()
    expect(store().toast?.text).toMatch(/Raise the walls/)
    store().setObjectParams(PROW, { h: 18 })
    expect(store().addFloor(PROW)).toBe(1)
    expect(floors().map((f) => f.name)).toEqual(['Main floor', 'Upper floor'])
    expect(store().addFloor(PROW)).toBeNull()
    store().renameFloor(PROW, 1, 'Loft')
    expect(floors()[1].name).toBe('Loft')
    store().removeFloor(PROW, 1)
    expect(floors()).toHaveLength(1)
  })
})
