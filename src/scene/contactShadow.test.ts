import { describe, expect, test } from 'vitest'
import { usePlanStore } from '../store/planStore'
import { castsContactShadow, shadowAlpha, shadowMesh, shadowOutlines, SHADOW_LIFT_M, SHADOW_REACH_M, SHADOW_STRENGTH } from './contactShadow'

const square = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
] as const

describe('contact shadows (4E)', () => {
  test('full under the building, fading to nothing past the reach', () => {
    expect(shadowAlpha([square], 2, 2)).toBe(SHADOW_STRENGTH)
    const near = shadowAlpha([square], 4.3, 2)
    expect(near).toBeGreaterThan(0)
    expect(near).toBeLessThan(SHADOW_STRENGTH)
    expect(shadowAlpha([square], 4 + SHADOW_REACH_M + 0.01, 2)).toBe(0)
  })

  test('the mesh drapes on the ground, a little above it', () => {
    const ground = (x: number, n: number) => 3 + 0.1 * x - 0.05 * n
    const m = shadowMesh([square], ground)
    for (let k = 0; k < m.positions.length / 3; k++) {
      const x = m.positions[k * 3]
      const n = -m.positions[k * 3 + 2]
      expect(m.positions[k * 3 + 1]).toBeCloseTo(ground(x, n) + SHADOW_LIFT_M, 5)
    }
    expect(m.indices.length).toBeGreaterThan(0)
  })

  test('Scheme C: every cabin casts, wings included, and trees do not', () => {
    usePlanStore.getState().loadScheme('C')
    const objects = Object.values(usePlanStore.getState().plan.objects)
    const cabins = objects.filter((o) => o.type === 'house')
    expect(cabins.every(castsContactShadow)).toBe(true)
    expect(objects.filter((o) => o.type === 'tree').some(castsContactShadow)).toBe(false)
    const prow = cabins.find((o) => Array.isArray(o.params.wings) && (o.params.wings as unknown[]).length > 0)!
    expect(shadowOutlines(prow).length).toBeGreaterThan(1)
  })
})
