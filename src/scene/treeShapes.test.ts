import { describe, expect, test } from 'vitest'
import { buildTree, seededRandom, speciesOf, treeSeed } from './treeShapes'

const env = { w: 7, d: 7, h: 9 }

describe('trees', () => {
  test('unknown species fall back to the madrone, as in the legacy treeSpecies()', () => {
    expect(speciesOf(undefined)).toBe('madrone')
    expect(speciesOf('fir')).toBe('fir')
  })
  test('the same seed grows the same tree', () => {
    const a = buildTree('madrone', env, '#4f7d4b', treeSeed('C-12'))
    const b = buildTree('madrone', env, '#4f7d4b', treeSeed('C-12'))
    expect(Array.from(a.crown.attributes.position.array)).toEqual(Array.from(b.crown.attributes.position.array))
    expect(seededRandom(5)()).toBe(seededRandom(5)())
  })
  test('every species stays inside its envelope and stands on y 0', () => {
    for (const sp of ['madrone', 'fir', 'cedar', 'alder'] as const) {
      const t = buildTree(sp, env, '#4f7d4b', 7)
      t.crown.computeBoundingBox()
      t.bark.computeBoundingBox()
      const c = t.crown.boundingBox!
      expect(c.max.y).toBeLessThan(env.h * 1.15)
      expect(Math.max(-c.min.x, c.max.x)).toBeLessThan(env.w * 0.65)
      expect(t.bark.boundingBox!.min.y).toBeLessThan(0.05)
      expect(t.crown.attributes.color.count).toBe(t.crown.attributes.position.count)
    }
  })
})
