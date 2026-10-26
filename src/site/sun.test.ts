import { describe, expect, test } from 'vitest'
import { sunPosition } from './sun'

describe('sun position at Islandale (legacy updateSun port)', () => {
  test('June solar noon is high in the south', () => {
    const s = sunPosition('jun', 12.3)
    expect(s.azimuthDeg).toBeCloseTo(180, 3)
    expect(s.elevationDeg).toBeCloseTo(90 - 48.46 + 23.44, 3)
  })

  test('morning sun is in the east, afternoon sun in the west', () => {
    expect(sunPosition('sep', 9).azimuthDeg).toBeLessThan(180)
    expect(sunPosition('sep', 9).direction[0]).toBeGreaterThan(0)
    expect(sunPosition('sep', 16).azimuthDeg).toBeGreaterThan(180)
    expect(sunPosition('sep', 16).direction[0]).toBeLessThan(0)
  })

  test('7 am in December is below the horizon', () => {
    expect(sunPosition('dec', 7).elevationDeg).toBeLessThan(0)
  })

  test('direction is a unit vector pointing up when the sun is up', () => {
    const [x, n, up] = sunPosition('jun', 15).direction
    expect(Math.hypot(x, n, up)).toBeCloseTo(1, 9)
    expect(up).toBeGreaterThan(0)
  })
})
