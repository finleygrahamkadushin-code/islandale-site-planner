import { describe, expect, test } from 'vitest'
import type { PlanObject } from '../store/types'
import { pieceEnds, pieceSlope, type Ground } from './pieces'
import { checkPieces, type PieceVerdict } from './routeCheck'
import { routeItems } from './routeCollect'
import { fixPiece, type PieceFix } from './routeFix'
import { routeGraph } from './routeGraph'
import type { SnapTarget } from './targets'
import { FT, pad } from './routeTestKit'

const flat: Ground = () => 0
const verdict = (objects: PlanObject[], ground: Ground, id: string): PieceVerdict => checkPieces(routeGraph(routeItems(objects, ground), [])).get(id)!
const applied = (o: PlanObject, f: PieceFix): PlanObject => ({ ...o, params: f.params, position: f.position, rotation: f.rotation })

describe('fix piece', () => {
  test('lengthens a ramp steeper than 1:12 so it passes, keeping its top end in place', () => {
    // Arrange: 12 ft rising 1.5 ft (1:8), top at end B
    const ramp = pad('r', 'ramp', 12, 4, 0, 0, 0, { ends: { zA: 0, zB: 1.5 * FT }, rail: true })
    const before = pieceEnds(ramp, flat)

    // Act
    const f = fixPiece(ramp, { code: 'ramp-slope' }, { ground: flat })!
    const fixed = applied(ramp, f)

    // Assert
    expect(f.params.w).toBe(18)
    expect(f.note).toBe('Lengthened to 18 ft for 1:12.')
    expect(pieceSlope(fixed, flat)).toBeLessThanOrEqual(1 / 12 + 1e-9)
    expect(pieceEnds(fixed, flat).B[0]).toBeCloseTo(before.B[0], 4)
    expect(verdict([fixed], flat, 'r').issues.map((i) => i.code)).not.toContain('ramp-slope')
    // the original is untouched
    expect(ramp.params.w).toBe(12)
  })

  test('turns the handrails on', () => {
    const f = fixPiece(pad('r', 'ramp', 12, 4, 0, 0), { code: 'handrail' }, { ground: flat })!
    expect(f.params.rail).toBe(true)
  })

  test('widens a narrow piece to 4 ft', () => {
    const f = fixPiece(pad('w', 'walk', 10, 2.5, 0, 0), { code: 'width' }, { ground: flat })!
    expect(f.params.d).toBe(4)
  })

  test('splits a ramp rising over 30 in into runs with 5 ft landings', () => {
    // Arrange: 48 ft rising 4 ft (1:12)
    const ramp = pad('r', 'ramp', 48, 4, 0, 0, 0, { ends: { zA: 0, zB: 4 * FT } })

    // Act
    const f = fixPiece(ramp, { code: 'ramp-rise' }, { ground: flat })!

    // Assert
    expect(f.add.map((s) => s.kind)).toEqual(['landing', 'ramp'])
    expect(f.add[0].d).toBe(5)
    const rises = [(f.params.ends as { zA: number; zB: number }), f.add[1].ends].map((e) => (e.zB - e.zA) / 0.0254)
    expect(rises.every((r) => r <= 30 + 1e-6)).toBe(true)
  })

  test('adds a landing at the bottom of a ramp, inside its length when there is room', () => {
    const ramp = pad('r', 'ramp', 20, 4, 0, 0, 0, { ends: { zA: 0, zB: FT } })
    const f = fixPiece(ramp, { code: 'landing-bottom', text: 'No level 60 in landing at the bottom of the ramp run' }, { ground: flat })!
    expect(f.params.w).toBe(15)
    expect(f.add).toHaveLength(1)
    expect(f.add[0]).toMatchObject({ kind: 'landing', w: 5, ends: { zA: 0, zB: 0 } })
  })

  test('replaces a stair with a 1:12 ramp', () => {
    const stair = pad('s', 'stair', 8, 4, 0, 0, 0, { ends: { zA: 0, zB: 2 * FT } })
    const f = fixPiece(stair, { code: 'stair' }, { ground: flat })!
    expect(f.params).toMatchObject({ kind: 'ramp', w: 24, surface: 'concrete', rail: 'auto' })
  })

  test('turns a walk on 1:10 ground into a ramp', () => {
    const ground: Ground = (x) => x / 10
    const walk = pad('w', 'walk', 20, 4, 0, 0)
    const f = fixPiece(walk, { code: 'walk-slope' }, { ground })!
    expect(f.params.kind).toBe('ramp')
    expect(f.params.w).toBe(24)
  })

  test('sets a boardwalk end to meet the next piece across a step', () => {
    const bw = pad('b', 'boardwalk', 10, 4, 0, 0, 0, { ends: { zA: 0.1, zB: 0.1 } })
    const f = fixPiece(bw, { code: 'step', join: { end: 'A', z: 0 } }, { ground: flat })!
    expect(f.params.ends).toEqual({ zA: 0, zB: 0.1 })
  })

  test('snaps a piece across a gap when it is given the targets', () => {
    // Arrange: the walk's end A stands 0.5 m short of a target facing east
    const walk = pad('w', 'walk', 10, 4, 10 * FT * 0.5 + 0.5, 0)
    const target: SnapTarget = { x: 0, n: 0, z: 0, dir: [1, 0], label: 'Deck · edge', kind: 'deck-edge', owner: 'd' }

    // Act
    const f = fixPiece(walk, { code: 'gap', join: { end: 'A', z: 0, gap: true } }, { ground: flat, targets: [target] })!

    // Assert
    expect(f.position.x).toBeCloseTo(10 * FT * 0.5, 6)
    expect(f.note).toBe('Snapped to Deck · edge.')
  })

  test('has no fix for a walk step steeper than 1:12', () => {
    const walk = pad('w', 'walk', 4, 4, 0, 0)
    expect(fixPiece(walk, { code: 'step', join: { end: 'B', z: 1 } }, { ground: flat })).toBeNull()
  })
})
