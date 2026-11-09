import { describe, expect, test } from 'vitest'
import { clearanceRows } from '../../../ui/selectionStats'
import { DEFAULT_ENVIRONMENT, DEFAULT_SETBACKS } from '../../../store/types'
import { buildSiteSheet } from './SiteSheet'
import { labelBox, polysOverlap, type PlacedLabel } from './siteLabels'
import { earthworksFor, objectsOf, planOf, SCHEMES, SITE } from './siteTestKit'

const buildFor = (schemeId: string) => {
  const plan = planOf(schemeId)
  return { plan, build: buildSiteSheet({ plan, site: SITE, setbacks: DEFAULT_SETBACKS, environment: DEFAULT_ENVIRONMENT, ...earthworksFor(objectsOf(plan)) }, 'tabloid', 0.05, false) }
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

  test('every building is named, with its floor level', () => {
    expect(a.buildings.map((b) => b.id).sort()).toEqual(build.model.buildings.map((b) => b.id).sort())
    for (const b of a.buildings) {
      expect(b.names.map((n) => n.text).join(' ')).toBe(build.model.buildings.find((m) => m.id === b.id)!.name.toUpperCase())
      expect(b.level?.text).toMatch(/^FF .* NAVD88$/)
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
