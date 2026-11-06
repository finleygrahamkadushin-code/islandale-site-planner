import { expect, test } from 'vitest'
import { skyLook } from './skyLook'
import { sunPosition } from './sun'

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

test('the sky is warmer and hazier at golden hour than at noon (4E)', () => {
  const noon = skyLook(sunPosition('sep', 12.5).elevationDeg)
  const golden = skyLook(sunPosition('sep', 16.75).elevationDeg)
  expect(noon.warmth).toBeLessThan(0.05)
  expect(golden.warmth).toBeGreaterThan(noon.warmth)
  const [nr, , nb] = rgb(noon.horizon)
  const [gr, , gb] = rgb(golden.horizon)
  expect(gr - gb).toBeGreaterThan(nr - nb)
  expect(golden.turbidity).toBeGreaterThan(noon.turbidity)
})
