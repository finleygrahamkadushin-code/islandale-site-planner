import { describe, expect, test } from 'vitest'
import type { PlanObject } from '../../store/types'
import type { Ground } from '../pieces'
import { checkPieces, type PieceVerdict } from './routeCheck'
import { routeItems } from './routeCollect'
import { routeGraph } from './routeGraph'
import { routeReport } from './routeVerdict'
import { flatTerrain, pad } from './routeTestKit'

/**
 * What the route check must not wave through (review R2.10, R2.11): a
 * surface that is not firm and stable, a piece whose numbers are not
 * numbers, and a piece off the surveyed ground, where the terrain only
 * repeats its edge.
 */

const flat: Ground = () => 0
const verdictOf = (o: PlanObject): PieceVerdict => checkPieces(routeGraph(routeItems([o], flat), [])).get(o.id)!
const codes = (v: PieceVerdict) => v.issues.map((i) => i.code)

describe('R2.10 the walking surface', () => {
  test('a level grass walk fails: grass is not a firm, stable surface (ADA 302.1)', () => {
    const v = verdictOf(pad('g', 'walk', 20, 4, 0, 0, 0, { surface: 'grass' }))
    expect(v.verdict).toBe('fail')
    expect(codes(v)).toEqual(['surface'])
    expect(v.issues[0].text).toBe('Surface is grass, which is not firm, stable and slip resistant — ADA 302.1 / A117.1 302.1')
  })

  test.each(['gravel', 'concrete', 'pavers', 'boardwalk'])('a level %s walk passes', (surface) => {
    expect(verdictOf(pad('w', 'walk', 20, 4, 0, 0, 0, { surface })).verdict).toBe('pass')
  })
})

describe('R2.11 inputs the check cannot measure', () => {
  test('a walk whose position is not a number fails instead of passing', () => {
    const walk = { ...pad('n', 'walk', 20, 4, 0, 0), position: { x: Number.NaN, n: 0 } }
    const v = verdictOf(walk)
    expect(v.verdict).toBe('fail')
    expect(codes(v)).toEqual(['bad-input'])
  })

  test('a walk 500 m off the surveyed ground fails: its levels are not known there', () => {
    const terrain = flatTerrain()
    const rep = routeReport([pad('far', 'walk', 20, 4, 500, 0)], terrain, flat)
    const v = rep.pieces.get('far')!
    expect(v.verdict).toBe('fail')
    expect(codes(v)).toEqual(['off-survey'])
  })

  test('the same walk on the surveyed ground passes', () => {
    const rep = routeReport([pad('near', 'walk', 20, 4, 0, 0)], flatTerrain(), flat)
    expect(rep.pieces.get('near')!.verdict).toBe('pass')
  })
})
