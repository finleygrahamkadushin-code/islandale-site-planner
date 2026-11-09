import { describe, expect, it } from 'vitest'
import { terrainContours } from './contours'
import { siteEarthworks } from './earthworks/earthworks'
import { loadIslandale } from './islandale'
import { CONTOUR_STEP_FT, siteContours } from './siteContours'
import { ftToM } from './units'

const { terrain } = loadIslandale()

describe('siteContours', () => {
  it('is the survey contours, every 2 ft, when nothing reshapes the ground', () => {
    const works = siteEarthworks(terrain, [])
    const lines = siteContours(terrain, works, works.ground)
    const survey = terrainContours(terrain, ftToM(CONTOUR_STEP_FT))
    expect(lines.map((l) => l.ft)).toEqual(survey.map((l) => l.ft))
    expect(lines.map((l) => l.segments.length)).toEqual(survey.map((l) => l.segments.length))
    expect(lines.filter((l) => l.index).every((l) => Math.round(l.ft) % 10 === 0)).toBe(true)
  })
})
