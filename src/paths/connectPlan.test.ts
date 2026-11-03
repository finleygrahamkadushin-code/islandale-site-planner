import { describe, expect, test } from 'vitest'
import { connectPlan, straightChain, type ConnectOption } from './connectPlan'
import { specAsPiece, specEnds, type ConnectEnd, type PieceSpec } from './connectSpec'
import { stairInfo, type Ground } from './pieces'

const FT = 0.3048
const MM = 0.001
const BASE = 2
const flat: Ground = () => BASE

const opt = (options: readonly ConnectOption[], id: string) => options.find((o) => o.id === id)

/** Each piece's end B meets the next one's end A (at the same level); at an L's turn, run 2 leaves from the landing's side midpoint. */
function expectJoined(specs: readonly PieceSpec[], ground: Ground) {
  for (let i = 0; i + 1 < specs.length; i++) {
    const p = specs[i]
    const q = specs[i + 1]
    const P = specEnds(p, ground)
    const Q = specEnds(q, ground)
    expect(Math.abs(P.zB - Q.zA)).toBeLessThan(MM)
    const turn = Math.abs(Math.cos(((p.rotation - q.rotation) * Math.PI) / 180)) < 1e-6
    if (!turn) {
      expect(Math.hypot(P.B[0] - Q.A[0], P.B[1] - Q.A[1])).toBeLessThan(MM)
      continue
    }
    // a turn at a square landing: the shared point is the midpoint of one of the landing's sides
    const land = p.kind === 'landing' ? p : q
    const joint = p.kind === 'landing' ? Q.A : P.B
    expect(land.kind).toBe('landing')
    const offset = Math.hypot(joint[0] - land.position.x, joint[1] - land.position.n)
    expect(Math.abs(offset - (land.d * FT) / 2)).toBeLessThan(MM)
  }
}

/** The chain starts on picked end a and ends on picked end b, at their levels. */
function expectOnEnds(specs: readonly PieceSpec[], ground: Ground, a: ConnectEnd & { z: number }, b: ConnectEnd & { z: number }) {
  const first = specEnds(specs[0], ground)
  const last = specEnds(specs[specs.length - 1], ground)
  expect(Math.hypot(first.A[0] - a.x, first.A[1] - a.n)).toBeLessThan(MM)
  expect(Math.hypot(last.B[0] - b.x, last.B[1] - b.n)).toBeLessThan(MM)
  expect(Math.abs(first.zA - a.z)).toBeLessThan(MM)
  expect(Math.abs(last.zB - b.z)).toBeLessThan(MM)
}

function expectCodeStairs(specs: readonly PieceSpec[], ground: Ground) {
  const stairs = specs.filter((s) => s.kind === 'stair')
  expect(stairs.length).toBeGreaterThan(0)
  for (const s of stairs) {
    const info = stairInfo(specAsPiece(s), ground)
    expect(info.riserIn).toBeLessThanOrEqual(7 + 1e-9)
    expect(info.treadIn).toBeGreaterThanOrEqual(11 - 1e-9)
    expect(info.ok).toBe(true)
  }
}

describe('connectPlan', () => {
  test('two ends at the same level give a straight walk that passes', () => {
    // Arrange
    const a: ConnectEnd = { x: 0, n: 0, kind: 'ground', label: 'A' }
    const b: ConnectEnd = { x: 10, n: 0, kind: 'ground', label: 'B' }

    // Act
    const plan = connectPlan(a, b, flat)

    // Assert
    expect(plan.best).toBe('walk')
    expect(opt(plan.options, 'stair')).toBeUndefined()
    const walk = opt(plan.options, 'walk')!
    expect(walk.ok).toBe(true)
    expect(walk.specs).toHaveLength(1)
    expect(walk.specs[0]).toMatchObject({ kind: 'walk', rotation: 0, d: 4, surface: 'gravel' })
    expect(walk.specs[0].w).toBeCloseTo(10 / FT, 6)
    expect(walk.label).toMatch(/^Walk · 33 ft · 0\.0 % · passes$/)
    expectOnEnds(walk.specs, flat, plan.A, plan.B)
  })

  test('a 3 ft rise over 40 ft gives no straight ramp under 1:12, so a stair is offered with code risers and treads', () => {
    // Arrange
    const a: ConnectEnd = { x: 0, n: 0, kind: 'driveway', label: 'Drive' }
    const b: ConnectEnd = { x: 40 * FT, n: 0, z: BASE + 3 * FT, kind: 'piece', label: 'Walk · end A' }

    // Act
    const plan = connectPlan(a, b, flat)

    // Assert
    const ramp = opt(plan.options, 'ramp')!
    const stair = opt(plan.options, 'stair')!
    expect(ramp.ok && ramp.specs.filter((s) => s.kind === 'ramp').every((s) => Math.abs(s.ends.zB! - s.ends.zA!) / (s.w * FT) <= 1 / 12)).toBe(false)
    expect(ramp.disabled).toBe(true)
    expect(ramp.label).toMatch(/need about \d+ ft/)
    expect(stair.disabled).toBe(false)
    expect(stair.layout!.type).toBe('straight')
    expect(stair.layout!.risers).toBe(6)
    expectCodeStairs(stair.specs, flat)
    expectJoined(stair.specs, flat)
    expectOnEnds(stair.specs, flat, plan.A, plan.B)
  })

  test('a 2 ft rise over 36 ft gives a passing ramp at 1:12 or less with level landings at both ends', () => {
    // Arrange
    const a: ConnectEnd = { x: 0, n: 0, kind: 'driveway', label: 'Drive' }
    const b: ConnectEnd = { x: 0, n: 36 * FT, z: BASE + 2 * FT, kind: 'piece', label: 'Walk' }

    // Act
    const plan = connectPlan(a, b, flat)

    // Assert
    const ramp = opt(plan.options, 'ramp')!
    expect(ramp.ok).toBe(true)
    expect(ramp.specs.map((s) => s.kind)).toEqual(['landing', 'ramp', 'landing'])
    for (const s of ramp.specs.filter((p) => p.kind === 'ramp')) expect(Math.abs(s.ends.zB! - s.ends.zA!) / (s.w * FT)).toBeLessThanOrEqual(1 / 12)
    expect(ramp.specs.every((s) => s.rotation === 90)).toBe(true)
    expect(plan.best).toBe('ramp')
    expectJoined(ramp.specs, flat)
    expectOnEnds(ramp.specs, flat, plan.A, plan.B)
  })

  test('a ramp leaving a deck edge starts with a 5 ft landing out from the edge', () => {
    // Arrange
    const a: ConnectEnd = { x: 0, n: 0, z: BASE + 1.5 * FT, dir: [1, 0], kind: 'deck-edge', label: 'Deck' }
    const b: ConnectEnd = { x: 40 * FT, n: 0, kind: 'driveway', label: 'Drive' }

    // Act
    const ramp = opt(connectPlan(a, b, flat).options, 'ramp')!

    // Assert
    expect(ramp.ok).toBe(true)
    expect(ramp.specs[0].kind).toBe('landing')
    expect(ramp.specs[0].w).toBeCloseTo(5, 6)
    expect(ramp.specs[0].ends.zA).toBeCloseTo(BASE + 1.5 * FT, 6)
  })

  test('a short run with a big rise gives an L-stair whose landing turns it, with risers of 7 in or less and treads of 11 in or more', () => {
    // Arrange: an 8 ft high deck edge facing east, the drive 6 ft east and 6 ft north
    const a: ConnectEnd = { x: 0, n: 0, z: BASE + 8 * FT, dir: [1, 0], kind: 'deck-edge', label: 'Deck · east edge' }
    const b: ConnectEnd = { x: 6 * FT, n: 6 * FT, kind: 'driveway', label: 'Drive' }

    // Act
    const plan = connectPlan(a, b, flat)

    // Assert
    const stair = plan.options[0]
    expect(plan.stairFirst).toBe(true)
    expect(stair.id).toBe('stair')
    expect(stair.title).toBe('L-stair')
    const L = stair.layout!
    expect(L.type).toBe('L')
    expect(L.risers).toBeGreaterThanOrEqual(14)
    expect(stair.specs.slice(0, 3).map((s) => s.kind)).toEqual(['stair', 'landing', 'stair'])
    expect(stair.specs[1].d).toBe(4)
    expect(stair.specs[1].ends.zA).toBeCloseTo(L.zLanding!, 6)
    expect(stair.label).toMatch(/^L-stair · \d+ risers · 4×4 landing · /)
    expectCodeStairs(stair.specs, flat)
    expectJoined(stair.specs, flat)
    expectOnEnds(stair.specs, flat, plan.A, plan.B)
  })

  test('picked low end first: the stair specs still run A → B, joined and ending on both ends', () => {
    // Arrange
    const a: ConnectEnd = { x: 6 * FT, n: -6 * FT, kind: 'piece', label: 'Walk' }
    const b: ConnectEnd = { x: 0, n: 0, z: BASE + 6 * FT, dir: [1, 0], kind: 'door', label: 'Door' }

    // Act
    const plan = connectPlan(a, b, flat)

    // Assert
    const stair = opt(plan.options, 'stair')!
    expect(stair.layout!.type).toBe('L')
    expectCodeStairs(stair.specs, flat)
    expectJoined(stair.specs, flat)
    expectOnEnds(stair.specs, flat, plan.A, plan.B)
  })

  test('a free ground foot lands where the L-stair ends instead of adding a pad', () => {
    // Arrange
    const a: ConnectEnd = { x: 0, n: 0, z: BASE + 8 * FT, dir: [1, 0], kind: 'deck-edge', label: 'Deck' }
    const b: ConnectEnd = { x: 6 * FT, n: 6 * FT, kind: 'ground', label: 'ground' }

    // Act
    const stair = opt(connectPlan(a, b, flat).options, 'stair')!

    // Assert
    expect(stair.layout!.pad).toBeNull()
    expect(stair.specs.map((s) => s.kind)).toEqual(['stair', 'landing', 'stair'])
    expectJoined(stair.specs, flat)
  })

  test('a steep boardwalk fails at 1:20 and two ends on one spot give only disabled options', () => {
    // Arrange
    const a: ConnectEnd = { x: 0, n: 0, kind: 'ground' }
    const b: ConnectEnd = { x: 10, n: 0, z: BASE + 1, kind: 'piece' }

    // Act
    const steep = connectPlan(a, b, flat)
    const same = connectPlan(a, { x: 0.1, n: 0 }, flat)

    // Assert
    expect(opt(steep.options, 'boardwalk')!.ok).toBe(false)
    expect(opt(steep.options, 'boardwalk')!.label).toMatch(/over 5 % \(1:20\)$/)
    expect(opt(steep.options, 'walk')!.label).toMatch(/step at B/)
    expect(same.best).toBeNull()
    expect(same.options.every((o) => o.disabled && !o.specs.length)).toBe(true)
  })

  test('the Stair option comes first when asked for, even at one level', () => {
    // Arrange
    const a: ConnectEnd = { x: 0, n: 0, kind: 'ground' }
    const b: ConnectEnd = { x: 10, n: 0, kind: 'ground' }

    // Act
    const plan = connectPlan(a, b, flat, { prefer: 'stair' })

    // Assert
    expect(plan.options[0].id).toBe('stair')
    expect(plan.options[0].disabled).toBe(true)
    expect(plan.options[0].label).toMatch(/same level/)
  })
})

describe('straightChain', () => {
  test('splits a 4 ft rise into two 1:12 runs with a 5 ft landing between them', () => {
    // Arrange
    const D = 60 * FT

    // Act
    const chain = straightChain([0, 0], [D, 0], BASE, BASE + 4 * FT, 4, flat, false, false)!

    // Assert
    expect(chain.map((s) => s.kind)).toEqual(['ramp', 'landing', 'ramp'])
    expect(chain[1].d).toBe(5)
    expectJoined(chain, flat)
  })

  test('refuses a run that would dip more than 0.3 m below the ground', () => {
    // Arrange: a hump between the two ends
    const hump: Ground = (x) => BASE + Math.max(0, 2 - Math.abs(x - 5))

    // Act
    const chain = straightChain([0, 0], [10, 0], BASE, BASE, 4, hump, false, false)

    // Assert
    expect(chain).toBeNull()
  })
})
