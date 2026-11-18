import { describe, expect, test } from 'vitest'
import { layerOf } from '../store/types'
import { ftToM } from '../site/units'
import { buildLibraryObject, LIBRARY, libraryItem } from './library'

const flatGroundFt = () => 20

describe('object library (old planner LIB + the 5C path pieces)', () => {
  test('offers every old library object and every path piece, once each', () => {
    const names = LIBRARY.map((i) => i.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'Main house', 'Guest cabin', 'Shop / garage', 'Deck', 'Driveway', 'Trailer pad', 'Shed', 'Drainfield reserve', 'Garden beds',
        'Madrone (keep)', 'Douglas fir', 'Western redcedar', 'Red alder', 'Granite erratic', 'Native meadow', 'Rain-garden pond',
        'Sky bridge', 'Plunge pool', 'Walk', 'Ramp', 'Steps', 'Landing', 'Boardwalk',
      ]),
    )
    expect(LIBRARY).toHaveLength(28)
    expect(new Set(LIBRARY.map((i) => i.id)).size).toBe(LIBRARY.length)
  })

  test('keeps the old planner defaults', () => {
    const cabin = libraryItem('guest-cabin')
    expect(cabin.type).toBe('house')
    expect(cabin.params).toMatchObject({ w: 20, d: 16, h: 9, roof: 'gable', pitch: 8, ridge: 'z', overhang: 1.5 })
    expect(libraryItem('douglas-fir').params).toMatchObject({ tree: true, species: 'fir', h: 55 })
    expect(libraryItem('path-ramp').pathKind).toBe('ramp')
    expect(libraryItem('bench')).toMatchObject({ type: 'bench', group: 'site', name: 'Bench' })
    expect(libraryItem('bench').params).toEqual({ w: 6, d: 1.5, h: 1.5, back: true, cushion: true })
    expect(libraryItem('outdoor-kitchen')).toMatchObject({ type: 'outdoorKitchen', group: 'site', name: 'Outdoor kitchen', hint: 'stone-built · sink + grill' })
    expect(libraryItem('outdoor-kitchen').params).toEqual({ w: 12, d: 2.5, h: 3, shape: 'straight', ret: 6 })
    expect(libraryItem('firepit')).toMatchObject({ type: 'firepit', group: 'site', name: 'Sunken fire pit' })
    expect(libraryItem('fire-lounge')).toMatchObject({ type: 'firepit', group: 'site', name: 'Fire lounge', hint: 'sunken couches · fire trough' })
    expect(libraryItem('fire-lounge').params).toMatchObject({ w: 22, d: 14, shape: 'lounge', cushion: true })
    expect(libraryItem('dining-table')).toMatchObject({ type: 'diningTable', group: 'site', name: 'Dining table', hint: 'outdoor · seats 8' })
    expect(libraryItem('dining-table').params).toMatchObject({ w: 8, d: 3.5, h: 2.5, seats: 'chairs', count: 8, cushion: true })
  })

  test('throws on an unknown item', () => {
    expect(() => libraryItem('castle')).toThrow(/castle/)
  })

  test.each(LIBRARY.filter((i) => !i.pathKind).map((i) => [i.id, i] as const))('%s builds a valid plan object', (_id, item) => {
    const o = buildLibraryObject(item, { id: 'obj-1', name: item.name, at: { x: 3, n: -4 }, rotation: 30, groundFt: flatGroundFt })
    // a new bridge always lies east-west, as in the old planner (its own test below)
    expect(o).toMatchObject({ id: 'obj-1', type: item.type, name: item.name, rotation: item.type === 'bridge' ? 0 : 30, locked: false, hidden: false, labelVisible: true })
    expect(Number(o.params.w)).toBeGreaterThan(0)
    expect(Number(o.params.d)).toBeGreaterThan(0)
    expect(o.params).not.toHaveProperty('hint')
    expect(o.params).not.toHaveProperty('t')
  })

  test('trees land on the Trees layer, cabins on Buildings', () => {
    const at = { x: 0, n: 0 }
    const tree = buildLibraryObject(libraryItem('red-alder'), { id: 'a', name: 'Red alder', at, rotation: 0, groundFt: flatGroundFt })
    const cabin = buildLibraryObject(libraryItem('main-house'), { id: 'b', name: 'Main house', at, rotation: 0, groundFt: flatGroundFt })
    expect(layerOf(tree)).toBe('trees')
    expect(layerOf(cabin)).toBe('buildings')
  })

  test('a new sky bridge gets the old planner default route: 40 ft, 12 ft over the ground, bowed', () => {
    const o = buildLibraryObject(libraryItem('sky-bridge'), { id: 'br', name: 'Sky bridge', at: { x: 5, n: 5 }, rotation: 45, groundFt: flatGroundFt })
    const route = o.params.route as number[][]
    const L = ftToM(40)
    expect(o.rotation).toBe(0)
    expect(route).toHaveLength(3)
    expect(route[0][0]).toBeCloseTo(-L / 2, 6)
    expect(route[2][0]).toBeCloseTo(L / 2, 6)
    expect(route[1][1] - route[0][1]).toBeCloseTo(L * 0.12, 6)
    // centred on the click, with the deck 12 ft over the ground (13 ft at the bow)
    expect((Math.min(...route.map((p) => p[1])) + Math.max(...route.map((p) => p[1]))) / 2).toBeCloseTo(0, 6)
    expect(route.map((p) => p[2])).toEqual([32, 33, 32])
  })
})
