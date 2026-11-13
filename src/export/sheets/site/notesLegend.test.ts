import { describe, expect, test } from 'vitest'
import { HIGH_WATER_LABEL } from '../../../site/highWater'
import { LEGEND_LABELS } from './NotesColumn'

describe('the site plan legend', () => {
  test('names the approximate high-water line in full, and keeps the lot line at the water as its own row (item 11)', () => {
    expect(HIGH_WATER_LABEL).toBe('approximate high-water line (8 ft NAVD88, from the terrain; not surveyed)')
    expect(LEGEND_LABELS).toContain('Approximate high-water line (8 ft NAVD88, from the terrain; not surveyed)')
    expect(LEGEND_LABELS).toContain('Lot line at the water (assessor)')
  })
})
