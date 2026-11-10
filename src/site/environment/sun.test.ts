import { describe, expect, test } from 'vitest'
import { clockZone, solarNoonHour, sunPosition } from './sun'

describe('sun position at Islandale (legacy updateSun port)', () => {
  test('June solar noon is high in the south', () => {
    const s = sunPosition('jun', solarNoonHour('jun'))
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

  // R2.6: the hour is clock time, with daylight saving in June and September (decision 4)
  test('3:00 pm in June is where the real sun is: about 230° and 57° up', () => {
    const s = sunPosition('jun', 15)
    expect(s.azimuthDeg).toBeGreaterThan(228)
    expect(s.azimuthDeg).toBeLessThan(232)
    expect(s.elevationDeg).toBeGreaterThan(56)
    expect(s.elevationDeg).toBeLessThan(58.5)
  })

  test('solar noon falls by the clock: about 1:13 pm in June, 1:04 pm in September, 12:09 pm in December', () => {
    expect(solarNoonHour('jun')).toBeCloseTo(13 + 13 / 60, 1)
    expect(solarNoonHour('sep')).toBeCloseTo(13 + 4 / 60, 1)
    expect(solarNoonHour('dec')).toBeCloseTo(12 + 9 / 60, 1)
  })

  test('a 20 ft wall’s shadow at 3 pm in June is about 13 ft long', () => {
    const el = (sunPosition('jun', 15).elevationDeg * Math.PI) / 180
    expect(20 / Math.tan(el)).toBeCloseTo(13, 0)
  })

  test('the hour is read on Pacific daylight time in June and September, standard time in December', () => {
    expect([clockZone('jun'), clockZone('sep'), clockZone('dec')]).toEqual(['PDT', 'PDT', 'PST'])
  })
})
