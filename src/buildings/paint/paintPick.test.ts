import { describe, expect, test } from 'vitest'
import { buildingMasses } from '../masses'
import { elementLabel, nearestEdge, paintPartOf } from './paintPick'

describe('paint picking (legacy extPartKey, hitElement)', () => {
  test('tags map to exterior parts; stairs and ramps paint as decks', () => {
    expect(paintPartOf('wall')).toBe('wall')
    expect(paintPartOf('stair')).toBe('deck')
    expect(paintPartOf('ramp')).toBe('deck')
    expect(paintPartOf('tree')).toBeNull()
  })

  test('the nearest edge of a rect wall: back, right, front, left', () => {
    const [m] = buildingMasses({ w: 20, d: 10 })
    expect(nearestEdge(m, [0, -5.2])).toBe(0)
    expect(nearestEdge(m, [10.1, 0])).toBe(1)
    expect(nearestEdge(m, [0, 5.1])).toBe(2)
    expect(nearestEdge(m, [-9.9, 1])).toBe(3)
  })

  test('a turned wing reads the point in its own frame', () => {
    const masses = buildingMasses({ w: 20, d: 10, wings: [{ kind: 'wall', w: 8, d: 6, dx: 20, dz: 0, rot: 90 }] })
    // turned 90°, the wing's back edge faces −x in the building frame and its front +x
    expect(nearestEdge(masses[1], [17.1, 0])).toBe(0)
    expect(nearestEdge(masses[1], [22.9, 0])).toBe(2)
  })

  test('labels', () => {
    expect(elementLabel('Main', 'wall', 2)).toBe('Main · Wall 3')
    expect(elementLabel('Deck 2', 'rail', null)).toBe('Deck 2 · Rail')
  })
})
