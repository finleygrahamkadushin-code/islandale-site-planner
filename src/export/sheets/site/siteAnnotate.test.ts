import { describe, expect, test } from 'vitest'
import { clearanceRows } from '../../../ui/selectionStats'
import { ftIn } from '../../../site/rules/clearances'
import { M_PER_FT } from '../../../site/units'
import { DEFAULT_ENVIRONMENT, DEFAULT_SETBACKS } from '../../../store/types'
import { buildSiteSheet } from './SiteSheet'
import { labelBox, polysOverlap, type PlacedLabel } from './siteLabels'
import { earthworksFor, objectsOf, planOf, SCHEMES, SITE } from './siteTestKit'

const buildFor = (schemeId: string, northUp = false) => {
  const plan = planOf(schemeId)
  return { plan, build: buildSiteSheet({ plan, site: SITE, setbacks: DEFAULT_SETBACKS, environment: DEFAULT_ENVIRONMENT, ...earthworksFor(objectsOf(plan)) }, 'tabloid', 0.05, northUp) }
}

describe.each(SCHEMES.map((s) => s.id))('site plan words · Scheme %s', (schemeId) => {
  const { plan, build } = buildFor(schemeId)
  const a = build.annotations
  const all: PlacedLabel[] = [...a.buildings.flatMap((b) => [...b.names, ...(b.level ? [b.level] : [])]), ...a.clearances.flatMap((c) => (c.label ? [c.label] : [])), ...a.lines, ...a.things, ...a.contours]

  test('no two words overprint', () => {
    const boxes = all.map((l) => labelBox(l, 0))
    const clashes: string[] = []
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (polysOverlap(boxes[i], boxes[j])) clashes.push(`${all[i].text} × ${all[j].text}`)
    expect(clashes).toEqual([])
  })

  test('every word is on the drawing', () => {
    const e = build.layout.extent
    for (const l of all) for (const [x, y] of labelBox(l, 0)) {
      expect(x).toBeGreaterThan(e.x)
      expect(x).toBeLessThan(e.x + e.w)
      expect(y).toBeGreaterThan(e.y)
      expect(y).toBeLessThan(e.y + e.h)
    }
  })

  test('every cabin is named, with its floor level; a standalone deck only by name, where it fits', () => {
    expect(a.buildings.map((b) => b.id).sort()).toEqual(build.model.buildings.map((b) => b.id).sort())
    for (const b of a.buildings) {
      const m = build.model.buildings.find((x) => x.id === b.id)!
      const cabin = m.parts.some((p) => p.kind === 'wall')
      if (!cabin && !b.names.length) continue
      expect(b.names.map((n) => n.text).join(' ')).toBe(m.name.toUpperCase())
      if (cabin) expect(b.level?.text).toMatch(/^FF .* NAVD88$/)
      else expect(b.level).toBeNull()
    }
  })

  test('a building across its lot line gets no lot-line dimension, as the inspector gives it no distance', () => {
    for (const o of objectsOf(plan).filter((x) => x.type === 'house')) {
      const crosses = clearanceRows(o, plan, SITE, DEFAULT_SETBACKS).some((r) => r.text === 'crosses the lot line')
      if (crosses) expect(a.clearances.some((c) => c.id === o.id && c.kind === 'lot')).toBe(false)
    }
  })

  test('each clearance figure reads as the inspector’s, and every dimension has one', () => {
    for (const c of a.clearances) {
      expect(c.label).not.toBeNull()
      const o = plan.objects[c.id]
      const rows = clearanceRows(o, plan, SITE, DEFAULT_SETBACKS)
      const want = rows.find((r) => r.label === (c.kind === 'shore' ? 'To shore' : 'To lot line'))!.text
      // the drawing writes the same figure the inspector does, before its first word
      expect(want.startsWith(c.label!.text.split(' TO ')[0])).toBe(true)
    }
  })
})

describe.each([false, true])('clearance dimensions measure what they say · north up %s', (northUp) => {
  test('Scheme C: each line is as long as its figure', () => {
    const { build } = buildFor('C', northUp)
    expect(build.annotations.clearances.length).toBeGreaterThan(0)
    for (const c of build.annotations.clearances) {
      const drawnFt = Math.hypot(c.to[0] - c.from[0], c.to[1] - c.from[1])
      // the figure before " TO", in the inspector's rounding, is the drawn line's length in the same rounding
      expect(c.label!.text.split(' TO ')[0]).toBe(ftIn(drawnFt * M_PER_FT))
    }
  })
})
