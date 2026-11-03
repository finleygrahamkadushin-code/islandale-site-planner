import { describe, expect, test } from 'vitest'
import type { PlanObject } from '../store/types'
import { cabin, doorOf, flatGround, flatTerrain, landingAtDoor, SIX_IN_M } from './junctionsFixture'
import { fmtIn, fmtSigned, levelReport, levelReportFor } from './levels'
import { fixPatches, levelEverything, type PlanPatch } from './levelsFixes'
import { levelsPanel, rowText } from './levelsPanel'

const applyPatches = (objects: readonly PlanObject[], patches: readonly PlanPatch[]): PlanObject[] =>
  objects.map((o) => {
    const p = patches.find((q) => q.objectId === o.id)
    return p ? { ...o, params: { ...o.params, ...p.params }, position: p.position ?? o.position } : o
  })

describe('formatting', () => {
  test('steps read in half inches, and feet past two feet', () => {
    expect(fmtIn(6 * 0.0254)).toBe('6 in')
    expect(fmtIn(-0.5 * 0.0254)).toBe('½ in')
    expect(fmtIn(6.5 * 0.0254)).toBe('6½ in')
    expect(fmtIn(27 * 0.0254)).toBe('2 ft 3 in')
    expect(fmtSigned(-2 * 0.0254)).toBe('−2 in')
    expect(fmtSigned(0)).toBe('+0 in')
  })
})

describe('level report', () => {
  test('a flush junction reports ok', () => {
    // Arrange
    const house = cabin()
    const objects = [house, landingAtDoor(house, doorOf(house).z)]

    // Act
    const report = levelReport(house, objects, flatTerrain, flatGround)
    const panel = levelsPanel(house, objects, flatTerrain, flatGround)!

    // Assert
    expect(report).toEqual({ ok: true, name: 'Cabin', items: [] })
    expect(panel.ok).toBe(true)
    expect(panel.junctions.map(rowText)).toEqual(['Landing → door · flush'])
    expect(panel.junctions[0].severity).toBe('ok')
    expect(panel.fixes).toEqual([])
  })

  test('a landing 6 in below the sill is flagged, with a setEnds fix', () => {
    // Arrange
    const house = cabin()
    const { z } = doorOf(house)
    const objects = [house, landingAtDoor(house, z - SIX_IN_M)]

    // Act
    const report = levelReport(house, objects, flatTerrain, flatGround)
    const panel = levelsPanel(house, objects, flatTerrain, flatGround)!

    // Assert
    expect(report.ok).toBe(false)
    expect(report.items).toHaveLength(1)
    expect(report.items[0]).toMatchObject({ code: 'piece-step', what: 'Landing end B is 6 in below door', fix: { type: 'setEnds', piece: 'P', end: 'B' } })
    expect(panel.junctions.map(rowText)).toEqual(['Landing → door · 6 in low'])
    expect(panel.junctions[0]).toMatchObject({ ok: false, severity: 'warn', fix: 0 })
  })

  test('Fix makes the step flush in one patch', () => {
    // Arrange
    const house = cabin()
    const { z } = doorOf(house)
    const objects = [house, landingAtDoor(house, z - SIX_IN_M)]
    const panel = levelsPanel(house, objects, flatTerrain, flatGround)!

    // Act
    const { patches, count } = fixPatches([panel.fixes[panel.junctions[0].fix]], objects, flatGround)
    const fixed = applyPatches(objects, patches)

    // Assert
    expect(count).toBe(1)
    expect(patches).toEqual([{ objectId: 'P', params: { ends: { zA: z - SIX_IN_M, zB: +z.toFixed(4) } } }])
    expect(levelReport(fixed[0], fixed, flatTerrain, flatGround).ok).toBe(true)
  })

  test('Level everything levels a wing slip and a stepped landing in one set of patches', () => {
    // Arrange: a back deck wing 1 ft up, and the landing 6 in low
    const house = cabin([{ kind: 'deck', open: true, w: 12, d: 8, dx: 0, dz: -12, lvl: 1 }])
    const { z } = doorOf(house)
    const objects = [house, landingAtDoor(house, z - SIX_IN_M)]
    const report = levelReport(house, objects, flatTerrain, flatGround)

    // Act
    const result = levelEverything(report, objects, flatGround)
    const fixed = applyPatches(objects, result.patches)

    // Assert
    expect(report.items.map((it) => it.code)).toEqual(['wing-level', 'piece-step'])
    expect(report.items[0].what).toBe('deck 1 is 12 in above the main floor')
    expect(result.count).toBe(2)
    expect(result.message).toBe('Levelled 2 junctions on Cabin · Undo to revert')
    expect(result.patches.map((p) => p.objectId)).toEqual(['H', 'P'])
    expect((fixed[0].params.wings as { lvl: number }[])[0].lvl).toBe(0)
    expect(levelReport(fixed[0], fixed, flatTerrain, flatGround).ok).toBe(true)
    expect(levelEverything(levelReport(fixed[0], fixed, flatTerrain, flatGround), fixed, flatGround).message).toBe('Everything on Cabin is already level')
  })

  test('a piece end short of the door gets a snapEnd fix that moves it onto the sill', () => {
    // Arrange: the flush landing pulled 20 cm south
    const house = cabin()
    const { c, z } = doorOf(house)
    const near = landingAtDoor(house, z)
    const piece = { ...near, position: { x: near.position.x, n: near.position.n - 0.2 } }
    const objects = [house, piece]

    // Act
    const report = levelReport(house, objects, flatTerrain, flatGround)
    const { patches } = fixPatches(report.items.flatMap((it) => (it.fix ? [it.fix] : [])), objects, flatGround)

    // Assert
    expect(report.items[0]).toMatchObject({ code: 'piece-gap', what: 'Landing end B stops 8 in short of door' })
    expect(patches[0].position?.n).toBeCloseTo(c[1] - (5 * 0.3048) / 2)
  })

  test('a locked piece is left alone', () => {
    // Arrange
    const house = cabin()
    const piece = { ...landingAtDoor(house, doorOf(house).z - SIX_IN_M), locked: true }
    const report = levelReport(house, [house, piece], flatTerrain, flatGround)

    // Act
    const { patches, count } = fixPatches(report.items.flatMap((it) => (it.fix ? [it.fix] : [])), [house, piece], flatGround)

    // Assert
    expect(count).toBe(0)
    expect(patches).toEqual([])
  })

  test('a stair top off the surface it hangs from reads as a wing row with a setLvl fix', () => {
    // Arrange
    const J = [{ edge: { mi: 1, i: 2 }, kind: 'stair-wing' as const, other: { id: 'H', mi: 2 }, u0: 0, u1: 1, u: 0.5, zOther: 3, zHere: 3.3, dz: -0.3, gapM: 0, side: 1, label: 'deck 1 front edge', name: 'Steps 2', at: [0, 0] as const }]
    const masses = [
      { mi: 0, name: 'main floor', kind: 'wall', lvl: 0, access: false },
      { mi: 1, name: 'deck 1', kind: 'deck', lvl: 1, access: false },
      { mi: 2, name: 'Steps 2', kind: 'stair', lvl: 0, access: true },
    ]

    // Act
    const report = levelReportFor({ hostId: 'H', name: 'Cabin', masses, junctions: J })

    // Assert
    expect(report.items.map((it) => [it.code, it.what])).toEqual([
      ['wing-level', 'deck 1 is 12 in above the main floor'],
      ['wing-top', 'Steps 2 top is 12 in below deck 1'],
    ])
    expect(report.items[1].fix).toEqual({ type: 'setLvl', host: 'H', mi: 2, lvl: 1 })
  })
})
