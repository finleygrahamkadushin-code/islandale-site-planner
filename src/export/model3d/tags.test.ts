import { describe, expect, test } from 'vitest'
import type { PlanObject } from '../../store/types'
import { meshExtras } from './tags'

const obj = (type: string, params: Record<string, unknown>): PlanObject => ({
  id: 'h1',
  type,
  name: 'Family Lantern',
  position: { x: 0, n: 0 },
  rotation: 0,
  params,
  locked: false,
  hidden: false,
  labelVisible: true,
})

const lantern = obj('house', {
  w: 20,
  d: 16,
  h: 9,
  walls: 'cedar',
  roof: 'gable',
  roofMat: 'copper',
  ext: { walls: { '0:2': { kind: 'stone' } }, parts: { rail: { style: 'cable' } } },
})

describe('meshExtras', () => {
  test('a wall takes its own edge’s kind, else the scheme’s', () => {
    expect(meshExtras(lantern, { part: 'wall', mi: 0, ei: 2 }, 0)).toMatchObject({ part: 'wall', wallKind: 'stone', mi: 0, ei: 2, oid: 'h1', objName: 'Family Lantern', t: 'house', partSrc: 'planner' })
    expect(meshExtras(lantern, { part: 'wall', mi: 0, ei: 1 }, 1).wallKind).toBe('cedar')
  })

  test('a painted wall is "painted", a plain roof "plain"', () => {
    const plain = obj('house', { w: 20, d: 16, h: 9, roof: 'gable' })
    expect(meshExtras(plain, { part: 'wall', mi: 0, ei: 0 }, 0).wallKind).toBe('painted')
    expect(meshExtras(plain, { part: 'roof', mi: 0 }, 0).roofMat).toBe('plain')
  })

  test('roof material and rail style come from the paint data', () => {
    expect(meshExtras(lantern, { part: 'roof', mi: 0 }, 0).roofMat).toBe('copper')
    expect(meshExtras(lantern, { part: 'rail', mi: 0 }, 0).railStyle).toBe('cable')
  })

  test('every building part carries the colour the app resolves', () => {
    expect(meshExtras(lantern, { part: 'trim', mi: 0, drawnHex: '#000000' }, 0).color).toMatch(/^#[0-9a-f]{6}$/)
  })

  test('mass-wide cladding is decor', () => {
    expect(meshExtras(lantern, { part: 'wall', mi: 0, massWide: true }, 0).decor).toBe(true)
  })

  test('a gable end keeps its wall kind and stays decor', () => {
    expect(meshExtras(lantern, { part: 'gable', mi: 0, massWide: true }, 0)).toMatchObject({ part: 'gable', wallKind: 'cedar', decor: true })
  })

  test('rooms inside are interior; their walls are partitions', () => {
    expect(meshExtras(lantern, { interiorPart: 'wall', mi: 0 }, 0)).toMatchObject({ part: 'partition', interior: true })
    expect(meshExtras(lantern, { interiorPart: 'furniture' }, 0)).toMatchObject({ part: 'furniture', interior: true })
  })

  test('an untagged piece is named after its object type, in its drawn colour', () => {
    const tree = obj('tree', { species: 'madrone' })
    expect(meshExtras(tree, { drawnHex: '#3a5a2a' }, 4)).toEqual({ part: 'tree', partSrc: 'inferred', oid: 'h1', objName: 'Family Lantern', t: 'tree', k: 4, color: '#3a5a2a' })
  })

  test('a bridge keeps its tagged part and drawn colour, without building paint', () => {
    expect(meshExtras(obj('bridge', {}), { part: 'rail', drawnHex: '#55595e' }, 0)).toEqual(
      expect.objectContaining({ part: 'rail', color: '#55595e' }),
    )
    expect(meshExtras(obj('bridge', {}), { part: 'rail' }, 0).railStyle).toBeUndefined()
  })
})
