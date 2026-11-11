import { expect, test } from 'vitest'
import { buildingMasses, buildingToMass, massToBuilding } from './masses'
import { massShapeTests } from './massShape'

// a 10 × 10 ft cabin with an 8 × 6 ft deck off its south side
const params = { w: 10, d: 10, h: 9, wings: [{ kind: 'deck', dz: 8, w: 8, d: 6 }] }

test('insideWalls finds the enclosed main walls from any mass, in that mass’s own frame', () => {
  const masses = buildingMasses(params)
  const [main, deck] = massShapeTests(masses)
  expect(main.insideWalls([0, 0])).toBe(true)
  expect(main.insideWalls([7, 0])).toBe(false)
  // the cabin's centre, seen from the deck's frame
  expect(deck.insideWalls(buildingToMass(masses[1], [0, 0]))).toBe(true)
  // the deck's own middle is not inside any enclosed walls: a deck is open
  expect(deck.insideWalls([0, 0])).toBe(false)
})

test('insideOther looks at every mass but its own', () => {
  const masses = buildingMasses(params)
  const [main, deck] = massShapeTests(masses)
  expect(main.insideOther([0, 0])).toBe(false)
  expect(main.insideOther(buildingToMass(masses[0], massToBuilding(masses[1], [0, 0])))).toBe(true)
  expect(deck.insideOther([0, 0])).toBe(false)
  expect(deck.insideOther(buildingToMass(masses[1], [0, 0]))).toBe(true)
})
