import { describe, expect, test } from 'vitest'
import { loadIslandaleTerrain } from '../site/islandale'
import { loadSchemes, schemeById } from '../site/schemes'
import { groundWithCuts } from '../site/earthworks'
import { sunkCuts } from '../scene/placement'
import { planFromScheme } from '../store/fromLegacy'
import { isFlush, junctionsFor, type HostEdge } from './junctions'
import { allJunctions, junctionChips } from './junctionsChips'
import { cabin, doorOf, flatGround, flatTerrain, landingAtDoor, obj, SIX_IN_M } from './junctionsFixture'
import { fillerStrips, hostJoinery, pieceTabs, thresholdPlates } from './junctionsGeom'
import { hostEdges, siteJunctions } from './junctionsSite'

const deckEdge: HostEdge = { owner: 'D', mi: 0, i: 2, a: [0, 0], b: [4, 0], nrm: [0, -1], z: 3, accept: 'all', doors: [], label: 'Deck front edge' }
const wall: HostEdge = { ...deckEdge, accept: 'doors', doors: [{ u0: 1.5, u1: 2.5, label: 'door', kind: 'door' }], label: 'main floor front wall' }

describe('junctionsFor', () => {
  test('a piece end on a deck edge at the deck surface is flush', () => {
    // Arrange
    const end = { kind: 'piece' as const, other: { id: 'P', end: 'B' as const }, x: 2, n: -0.02, z: 3.005, w: 1.2, name: 'Walk', pieceKind: 'ramp' as const }

    // Act
    const [j] = junctionsFor([deckEdge], [end])

    // Assert
    expect(j).toMatchObject({ kind: 'piece', edge: { mi: 0, i: 2 }, label: 'Deck front edge', side: 1 })
    expect(j.at[0]).toBeCloseTo(2)
    expect(j.at[1]).toBeCloseTo(0)
    expect(isFlush(j)).toBe(true)
  })

  test('an enclosed wall only takes an end that lands on a door', () => {
    // Arrange
    const onDoor = { kind: 'piece' as const, other: { id: 'P', end: 'A' as const }, x: 2, n: -0.1, z: 3, w: 1.2, name: 'Walk' }
    const offDoor = { ...onDoor, other: { id: 'Q', end: 'A' as const }, x: 0.2 }

    // Act
    const J = junctionsFor([wall], [onDoor, offDoor])

    // Assert
    expect(J).toHaveLength(1)
    expect(J[0].door?.label).toBe('door')
    expect(J[0].label).toBe('door')
  })

  test('a parallel deck edge 10 cm off abuts along the overlap', () => {
    // Arrange
    const abut = { kind: 'deck-abut' as const, other: { id: 'E', mi: 0, i: 0 }, owner: 'E', a: [1, -0.1] as const, b: [6, -0.1] as const, z: 3, name: 'deck' }

    // Act
    const [j] = junctionsFor([deckEdge], [abut])

    // Assert
    expect(j).toMatchObject({ kind: 'deck-abut', u0: 1, u1: 4 })
    expect(j.gapM).toBeCloseTo(0.1)
  })
})

describe('junctions on the site', () => {
  test('the cabin lends its front door wall, and a landing on the sill meets it flush', () => {
    // Arrange
    const house = cabin()
    const piece = landingAtDoor(house, doorOf(house).z)

    // Act
    const E = hostEdges(house, flatTerrain, flatGround)
    const J = siteJunctions(house, [house, piece], flatTerrain, flatGround)

    // Assert
    expect(E.map((e) => [e.i, e.accept, e.label])).toEqual([[2, 'doors', 'main floor front wall']])
    expect(J).toHaveLength(1)
    expect(J[0]).toMatchObject({ kind: 'piece', other: { id: 'P', end: 'B' }, name: 'Landing', pieceKind: 'landing' })
    expect(isFlush(J[0])).toBe(true)
  })

  test('a stair wing hung off the cabin lands its top on the front edge of a deck wing', () => {
    // Arrange: a deck across the front, steps off its front edge
    const house = cabin([
      { kind: 'deck', open: true, w: 20, d: 8, dx: 0, dz: 12 },
      { kind: 'stair', open: true, w: 4, d: 6, dx: 0, dz: 19 },
    ])

    // Act
    const J = siteJunctions(house, [house], flatTerrain, flatGround)

    // Assert
    const top = J.find((j) => j.kind === 'stair-wing')
    expect(top).toMatchObject({ edge: { mi: 1, i: 2 }, other: { mi: 2 }, name: 'Steps 2' })
    expect(top && Math.abs(top.dz)).toBeLessThan(1e-9)
  })

  test('Scheme C: the elders’ boardwalk meets the prow deck where the rails open', () => {
    // Arrange
    const terrain = loadIslandaleTerrain()
    const plan = planFromScheme(schemeById(loadSchemes(), 'C'))
    const objects = plan.order.map((id) => plan.objects[id])
    const ground = groundWithCuts(terrain, sunkCuts(objects, terrain))

    // Act
    const J = siteJunctions(plan.objects['C-0'], objects, terrain, ground)

    // Assert
    const walk = J.find((j) => j.kind === 'bridge' && j.edge.mi === 3 && j.edge.i === 15)
    expect(walk?.name).toBe('Elders’ walk · 1:21 boardwalk')
    expect(walk && isFlush(walk)).toBe(true)
  })
})

describe('junction chips', () => {
  test('a landing 6 in below the sill gets a "6 in step" chip at the door', () => {
    // Arrange
    const house = cabin()
    const { c, z } = doorOf(house)
    const piece = landingAtDoor(house, z - SIX_IN_M)

    // Act
    const chips = junctionChips(allJunctions([house, piece], flatTerrain, flatGround))

    // Assert
    expect(chips).toHaveLength(1)
    expect(chips[0]).toMatchObject({ text: '6 in step', severity: 'warn', hostId: 'H' })
    expect(chips[0].x).toBeCloseTo(c[0])
    expect(chips[0].n).toBeCloseTo(c[1])
    expect(chips[0].z).toBeCloseTo(z)
  })

  test('a flush landing gets no chip', () => {
    // Arrange
    const house = cabin()
    const piece = landingAtDoor(house, doorOf(house).z)

    // Act
    const chips = junctionChips(allJunctions([house, piece], flatTerrain, flatGround))

    // Assert
    expect(chips).toEqual([])
  })
})

describe('join geometry', () => {
  test('a threshold plate appears under a door a piece meets, 1 cm proud of the floor', () => {
    // Arrange
    const house = cabin()
    const { c, z } = doorOf(house)
    const piece = landingAtDoor(house, z)
    const E = hostEdges(house, flatTerrain, flatGround)
    const J = siteJunctions(house, [house, piece], flatTerrain, flatGround)

    // Act
    const plates = thresholdPlates(house, J, E)

    // Assert
    expect(plates).toHaveLength(1)
    const p = plates[0]
    expect(p).toMatchObject({ kind: 'threshold', ownerId: 'H', mi: 0, thickness: 0.03 })
    expect(p.topZ).toBeCloseTo(z + 0.01)
    const cx = p.outline.reduce((s, q) => s + q[0], 0) / 4
    const cn = p.outline.reduce((s, q) => s + q[1], 0) / 4
    expect(cx).toBeCloseTo(c[0])
    expect(cn).toBeCloseTo(c[1] + 0.05) // 5 cm in from the wall line (the front faces south)
  })

  test('no plate without anything at the door', () => {
    // Arrange
    const house = cabin()

    // Act
    const plates = hostJoinery(house, [house], flatTerrain, flatGround)

    // Assert
    expect(plates).toEqual([])
  })

  test('two level standalone decks 10 cm apart get one filler strip, drawn by the lower id', () => {
    // Arrange
    const d1 = obj('D1', 'deck', { w: 10, d: 10, h: 2, shape: 'rect' })
    const d2 = obj('D2', 'deck', { w: 10, d: 10, h: 2, shape: 'rect' }, 10 * 0.3048 + 0.1, 0)
    const objects = [d1, d2]

    // Act
    const f1 = hostJoinery(d1, objects, flatTerrain, flatGround)
    const f2 = fillerStrips(d2, siteJunctions(d2, objects, flatTerrain, flatGround), hostEdges(d2, flatTerrain, flatGround))

    // Assert
    expect(f1).toHaveLength(1)
    expect(f1[0]).toMatchObject({ kind: 'filler', ownerId: 'D1', thickness: 0.05 })
    expect(f1[0].topZ).toBeCloseTo(2 + 2 * 0.3048 - 0.004)
    expect(f2).toEqual([])
  })

  test('a pinned piece end on a door gets a 0.25 m tab under the sill', () => {
    // Arrange
    const house = cabin()
    const { c, z } = doorOf(house)
    const piece = landingAtDoor(house, z)

    // Act
    const tabs = pieceTabs(piece, [house, piece], flatTerrain, flatGround)

    // Assert
    expect(tabs).toHaveLength(1)
    expect(tabs[0]).toMatchObject({ kind: 'tab', ownerId: 'P', end: 'B' })
    expect(tabs[0].topZ).toBeCloseTo(z - 0.01)
    const far = Math.max(...tabs[0].outline.map((q) => q[1]))
    expect(far).toBeCloseTo(c[1] + 0.25)
  })
})
