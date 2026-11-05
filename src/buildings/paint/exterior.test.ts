import { describe, expect, test } from 'vitest'
import {
  BRUSH_FIELDS,
  DECK_PARTS,
  EXT_DEFAULT_COLOURS,
  EXT_PRESETS,
  applyPreset,
  describeExt,
  extOverrides,
  extPartKey,
  extResolve,
  paintExt,
  resetExt,
} from './exterior'
import { buildingRailStyle, railStyleOf, withRailStyle } from '../rails/railEdits'

type Params = Record<string, unknown>

/** Freeze every nested object, so a mutation of an input throws. */
function deepFreeze<T>(v: T): T {
  if (typeof v === 'object' && v !== null) {
    Object.values(v).forEach(deepFreeze)
    Object.freeze(v)
  }
  return v
}

/** A cabin with a porch, a skipped malformed wing, a cedar wing with a roof colour of its own, a deck and a kidney wing. */
const cabin = (ext?: Params): Params =>
  deepFreeze({
    w: 20,
    d: 16,
    h: 9,
    color: '#b8a888',
    roofColor: '#3c4043',
    walls: 'board',
    glassTint: '#a0c0d0',
    wings: [
      { kind: 'porch', w: 8, d: 5, dz: 10 },
      null,
      { w: 10, d: 8, dx: 15, walls: 'cedar', color: '#8b6a4a', roofColor: '#5f8a7a', roof: 'sod' },
      { kind: 'deck', w: 10, d: 6, dx: -14 },
      { w: 12, d: 9, dz: -14, shape: 'kidney', roof: 'dome', roofMat: 'copper' },
    ],
    ...(ext ? { ext } : {}),
  })

describe('extResolve: most specific first', () => {
  test('a wall: this wall, then its mass, then the whole house, then the scheme, then the default', () => {
    const ext = {
      walls: { '0:1': { color: '#111111' } },
      masses: { '0': { wall: { color: '#222222' } } },
      parts: { wall: { color: '#333333' } },
    }
    expect(extResolve(cabin(ext), 0, 'wall', 1)).toMatchObject({ color: '#111111', src: { color: 'element' }, ov: true })
    expect(extResolve(cabin(ext), 0, 'wall', 2)).toMatchObject({ color: '#222222', src: { color: 'mass' } })
    expect(extResolve(cabin(ext), 0, 'wall')).toMatchObject({ color: '#222222', src: { color: 'mass' } }) // no edge: no wall override
    expect(extResolve(cabin(ext), 1, 'wall', 1)).toMatchObject({ color: '#333333', src: { color: 'house' } })
    expect(extResolve(cabin(), 1, 'wall', 1)).toMatchObject({ color: '#b8a888', src: { color: 'scheme' }, ov: false })
    expect(extResolve({ w: 10, d: 10 }, 0, 'wall', 0)).toMatchObject({ color: EXT_DEFAULT_COLOURS.wall, kind: '', src: { color: 'default', kind: 'default' } })
  })

  test('each field is resolved on its own: a wall kind from the house and a colour from the wall', () => {
    const ext = { walls: { '0:0': { color: '#123456' } }, parts: { wall: { kind: 'stone' } } }
    expect(extResolve(cabin(ext), 0, 'wall', 0)).toMatchObject({ kind: 'stone', color: '#123456', src: { kind: 'house', color: 'element' } })
  })

  test("'' is a value for kind (painted) and mat (standard), so it overrides the scheme", () => {
    const ext = { parts: { wall: { kind: '' }, roof: { mat: '' } } }
    expect(extResolve(cabin(ext), 3, 'wall', 0)).toMatchObject({ kind: '', src: { kind: 'house' }, ov: true })
    expect(extResolve(cabin(ext), 4, 'roof')).toMatchObject({ mat: '', src: { mat: 'house' }, ov: true })
  })

  test('a stored value that is not valid is passed over, to the next scope', () => {
    const ext = { masses: { '0': { wall: { kind: 'chrome', color: 'red' } } }, parts: { wall: { kind: 'timber', color: '#abcdef' } } }
    expect(extResolve(cabin(ext), 0, 'wall', 0)).toMatchObject({ kind: 'timber', color: '#abcdef', src: { kind: 'house', color: 'house' } })
  })

  test('mass indexes count well-formed wings only, as buildingMasses does', () => {
    // mass 2 is wings[2] (wings[1] is null)
    expect(extResolve(cabin(), 2, 'wall', 0)).toMatchObject({ kind: 'cedar', color: '#8b6a4a' })
  })
})

describe('extResolve: the scheme fields (legacy fallbacks)', () => {
  test('wall kind: the mass’s own walls, else the building’s; an unknown kind is painted', () => {
    expect(extResolve(cabin(), 0, 'wall', 0)).toMatchObject({ kind: 'board', src: { kind: 'scheme' } })
    expect(extResolve(cabin(), 2, 'wall', 0).kind).toBe('cedar')
    expect(extResolve(cabin(), 1, 'wall', 0).kind).toBe('board') // a porch takes the building's walls (legacy specWallKind)
    expect(extResolve({ walls: 'adobe' }, 0, 'wall', 0)).toMatchObject({ kind: '', src: { kind: 'default' } })
    expect(extResolve({ walls: 'glass' }, 5, 'wall', 0).kind).toBe('') // a mass that is not there has no scheme fields
  })

  test('a kind with no colour anywhere takes the kind’s own colour (legacy specWallMat)', () => {
    expect(extResolve({ walls: 'stone' }, 0, 'wall', 0).color).toBe('#a39d92')
    expect(extResolve({ walls: 'cedar' }, 0, 'wall', 0).color).toBe('#9b6b43')
  })

  test('roof finish: the mass’s own roofMat, else sod for a sod roof; wings do not take the building’s', () => {
    expect(extResolve({ roofMat: 'copper' }, 0, 'roof')).toMatchObject({ mat: 'copper', src: { mat: 'scheme' }, ov: false })
    expect(extResolve(cabin(), 2, 'roof').mat).toBe('sod')
    expect(extResolve(cabin(), 4, 'roof').mat).toBe('copper')
    expect(extResolve({ roofMat: 'copper', wings: [{ w: 8, d: 8 }] }, 1, 'roof').mat).toBe('')
    expect(extResolve({ roofMat: 'shake' }, 0, 'roof').mat).toBe('') // not a finish the old planner draws
  })

  test('roof colour: the wing’s roofColor, else the building’s; a roof paint beats both', () => {
    expect(extResolve(cabin(), 2, 'roof')).toMatchObject({ color: '#5f8a7a', src: { color: 'scheme' } })
    expect(extResolve(cabin(), 1, 'roof').color).toBe('#3c4043')
    expect(extResolve(cabin({ masses: { '2': { roof: { color: '#aa0000' } } } }), 2, 'roof')).toMatchObject({ color: '#aa0000', src: { color: 'mass' }, ov: true })
  })

  test('with no roof colour anywhere the roof is the wall colour darkened, and follows wall paint', () => {
    expect(extResolve({ color: '#c8c8c8' }, 0, 'roof')).toMatchObject({ color: '#6e6e6e', via: 'wall', src: { color: 'scheme' }, ov: false })
    expect(extResolve({ color: '#c8c8c8', ext: { parts: { wall: { color: '#640000' } } } }, 0, 'roof')).toMatchObject({ color: '#370000', src: { color: 'house' }, ov: true })
    // a scheme roof colour is kept over wall paint
    expect(extResolve(cabin({ parts: { wall: { color: '#640000' } } }), 0, 'roof').color).toBe('#3c4043')
  })

  test('trim follows the wall paint of its mass or building, else the scheme wall colour', () => {
    expect(extResolve(cabin(), 0, 'trim')).toMatchObject({ color: '#b8a888', via: 'wall', ov: false })
    expect(extResolve(cabin({ masses: { '0': { wall: { color: '#101010' } } } }), 0, 'trim')).toMatchObject({ color: '#101010', ov: true })
    // one wall's paint is that wall only
    expect(extResolve(cabin({ walls: { '0:0': { color: '#101010' } } }), 0, 'trim').color).toBe('#b8a888')
    expect(extResolve(cabin({ parts: { trim: { color: '#202020' } } }), 0, 'trim')).toMatchObject({ color: '#202020', src: { color: 'house' } })
  })

  test('a glass wall is tinted by the window glass paint, else the scheme’s glassTint', () => {
    expect(extResolve(cabin(), 0, 'wall', 0).tint).toBe('#a0c0d0')
    const glass = cabin({ parts: { wall: { kind: 'glass' }, glass: { color: '#00ff00' } } })
    expect(extResolve(glass, 0, 'wall', 0)).toMatchObject({ kind: 'glass', tint: '#00ff00', ov: true })
    expect(extResolve(cabin({ parts: { glass: { color: '#00ff00' } } }), 0, 'wall', 0).ov).toBe(false) // board walls: no glass to tint
  })

  test('colour-only parts: their paint, else the legacy default; a standalone deck’s boards take its colour', () => {
    expect(extResolve(cabin(), 0, 'door')).toMatchObject({ color: '#5a4634', src: { color: 'default' }, ov: false })
    expect(extResolve(cabin({ parts: { foundation: { color: '#9a9184' } } }), 3, 'foundation')).toMatchObject({ color: '#9a9184', ov: true })
    expect(extResolve(cabin(), 3, 'deck').color).toBe('#c9ad84')
    expect(extResolve({ color: '#a8835c' }, 0, 'deck', null, 'deck')).toMatchObject({ color: '#a8835c', src: { color: 'scheme' } })
    expect(extResolve(cabin({ parts: { deck: { color: '#777777' } } }), 3, 'stair')).toMatchObject({ part: 'stair', color: '#777777', via: 'deck', ov: true })
  })

  test('a curved mass has one wall: any edge reads the override stored at edge 0', () => {
    const ext = { walls: { '4:0': { color: '#0000aa' } } }
    expect(extResolve(cabin(ext), 4, 'wall', 17).color).toBe('#0000aa')
    expect(extResolve(cabin({ walls: { '0:0': { color: '#0000aa' } } }), 0, 'wall', 1).color).toBe('#b8a888')
  })
})

describe('rails', () => {
  test('the style is the same data as 5A’s: ext.parts.rail.style, a mass’s own first, else wood', () => {
    const p = withRailStyle(cabin(), 'cable')
    expect(extResolve(p, 1, 'rail')).toMatchObject({ style: 'cable', src: { style: 'house' }, ov: true })
    expect(railStyleOf(p, 1)).toBe('cable')
    const both = paintExt(p, { scope: 'mass', part: 'rail', mi: 3, fields: { style: 'glass' } })
    expect([railStyleOf(both, 3), railStyleOf(both, 1), buildingRailStyle(both)]).toEqual(['glass', 'cable', 'cable'])
    expect(extResolve(cabin(), 1, 'rail')).toMatchObject({ style: 'wood', src: { style: 'default' } })
  })

  test('colour: their own, else steel for steel and cable, else the posts on a deck and the trim elsewhere', () => {
    expect(extResolve(cabin(), 1, 'rail')).toMatchObject({ color: '#b8a888', via: 'trim', ov: false })
    expect(extResolve(cabin(), 3, 'rail')).toMatchObject({ color: '#6e5a44', via: 'post' })
    expect(extResolve({ color: '#a8835c' }, 0, 'rail', null, 'deck')).toMatchObject({ color: '#6e5a44', via: 'post' })
    expect(extResolve(cabin({ parts: { rail: { style: 'steel' } } }), 1, 'rail')).toMatchObject({ color: '#3b3f44', src: { color: 'style' } })
    const own = cabin({ parts: { rail: { style: 'cable', color: '#ffffff' } } })
    expect(extResolve(own, 1, 'rail')).toMatchObject({ color: '#ffffff', src: { color: 'house' } })
    expect(extResolve(cabin({ parts: { post: { color: '#010101' } } }), 3, 'rail')).toMatchObject({ color: '#010101', ov: true })
  })

  test('painting the house rail wood removes the style, as withRailStyle does; a mass keeps wood to override the house', () => {
    const steel = withRailStyle({ w: 10 }, 'steel')
    expect(paintExt({ w: 10 }, { scope: 'house', part: 'rail', fields: { style: 'steel' } })).toEqual(steel)
    expect(paintExt(steel, { scope: 'house', part: 'rail', fields: { style: 'wood' } })).toEqual({ w: 10 })
    const mass = paintExt(steel, { scope: 'mass', part: 'rail', mi: 0, fields: { style: 'wood' } })
    expect(mass.ext).toEqual({ parts: { rail: { style: 'steel' } }, masses: { '0': { rail: { style: 'wood' } } } })
    expect(railStyleOf(mass, 0)).toBe('wood')
  })
})

describe('paintExt', () => {
  const red = { color: '#AA0000' }

  test('element scope on a wall paints that wall; on any other part it paints the mass', () => {
    expect(paintExt(cabin(), { scope: 'element', part: 'wall', mi: 2, edge: 3, fields: red }).ext).toEqual({ walls: { '2:3': { color: '#aa0000' } } })
    expect(paintExt(cabin(), { scope: 'element', part: 'roof', mi: 2, edge: 3, fields: red }).ext).toEqual({ masses: { '2': { roof: { color: '#aa0000' } } } })
    expect(paintExt(cabin(), { scope: 'element', part: 'wall', mi: 2, fields: red }).ext).toEqual({ masses: { '2': { wall: { color: '#aa0000' } } } })
  })

  test('mass scope paints the part of that mass; house scope, or no mass, paints the building', () => {
    expect(paintExt(cabin(), { scope: 'mass', part: 'wall', mi: 1, edge: 0, fields: red }).ext).toEqual({ masses: { '1': { wall: { color: '#aa0000' } } } })
    expect(paintExt(cabin(), { scope: 'house', part: 'wall', mi: 1, edge: 0, fields: red }).ext).toEqual({ parts: { wall: { color: '#aa0000' } } })
    expect(paintExt(cabin(), { scope: 'element', part: 'trim', fields: red }).ext).toEqual({ parts: { trim: { color: '#aa0000' } } })
  })

  test('stairs and ramps paint the deck; a curved wall is stored at edge 0', () => {
    expect(paintExt(cabin(), { scope: 'mass', part: 'stair', mi: 3, fields: red }).ext).toEqual({ masses: { '3': { deck: { color: '#aa0000' } } } })
    expect(paintExt(cabin(), { scope: 'element', part: 'wall', mi: 4, edge: 9, fields: red }).ext).toEqual({ walls: { '4:0': { color: '#aa0000' } } })
  })

  test('fields the part does not take are ignored, so one brush paints any part', () => {
    const brush = { kind: 'cedar', color: '#9b6b43', mat: 'copper', style: 'steel' } as const
    const roof = paintExt(cabin(), { scope: 'house', part: 'roof', fields: brush })
    expect(roof.ext).toEqual({ parts: { roof: { color: '#9b6b43', mat: 'copper' } } })
    const door = paintExt(roof, { scope: 'house', part: 'door', fields: brush })
    expect((door.ext as Params).parts).toEqual({ roof: { color: '#9b6b43', mat: 'copper' }, door: { color: '#9b6b43' } })
  })

  test('a later paint merges into the same override; null removes one field', () => {
    const a = paintExt(cabin(), { scope: 'house', part: 'wall', fields: { kind: 'cedar', color: '#9b6b43' } })
    const b = paintExt(a, { scope: 'house', part: 'wall', fields: { color: null } })
    expect(b.ext).toEqual({ parts: { wall: { kind: 'cedar' } } })
    expect(paintExt(b, { scope: 'house', part: 'wall', fields: { kind: null } })).not.toHaveProperty('ext')
  })

  test('a paint that changes nothing returns the params themselves', () => {
    const a = paintExt(cabin(), { scope: 'house', part: 'wall', fields: { kind: 'cedar' } })
    expect(paintExt(a, { scope: 'house', part: 'wall', fields: { kind: 'cedar' } })).toBe(a)
    expect(paintExt(a, { scope: 'house', part: 'roof', fields: { color: null } })).toBe(a)
    expect(paintExt(a, { scope: 'house', part: 'roof', fields: { kind: 'stone' } })).toBe(a)
  })

  test('bad values, parts and indexes are refused', () => {
    expect(() => paintExt(cabin(), { scope: 'house', part: 'wall', fields: { color: 'red' } })).toThrow(/not a color/)
    expect(() => paintExt(cabin(), { scope: 'house', part: 'wall', fields: { kind: 'adobe' as never } })).toThrow(/not a kind/)
    expect(() => paintExt(cabin(), { scope: 'house', part: 'roof', fields: { mat: 'shake' as never } })).toThrow(/not a mat/)
    expect(() => paintExt(cabin(), { scope: 'house', part: 'chimney' as never, fields: red })).toThrow(/no exterior finish/)
    expect(() => paintExt(cabin(), { scope: 'mass', part: 'wall', mi: 5, fields: red })).toThrow(/no mass 5/)
    expect(() => paintExt(cabin(), { scope: 'element', part: 'wall', mi: 0, edge: 4, fields: red })).toThrow(/no wall 4 of 4/)
  })

  test('the input params are never changed, and emptied objects are dropped', () => {
    const p = cabin({ parts: { roof: { mat: 'copper' } }, masses: { '1': { wall: {} } }, walls: { '0:0': { color: '#111111' } } })
    const next = paintExt(p, { scope: 'element', part: 'wall', mi: 0, edge: 0, fields: { color: null } })
    expect(next.ext).toEqual({ parts: { roof: { mat: 'copper' } } })
    expect((p.ext as Params).walls).toEqual({ '0:0': { color: '#111111' } }) // frozen, and untouched
  })
})

describe('resetExt', () => {
  const painted = () =>
    cabin({
      parts: { wall: { kind: 'cedar' }, rail: { style: 'steel' } },
      masses: { '1': { roof: { color: '#111111' }, trim: { color: '#222222' } }, '2': { wall: { color: '#333333' } } },
      walls: { '0:2': { color: '#444444' } },
    })

  test('removes one override and the objects it leaves empty', () => {
    expect(resetExt(painted(), 'walls.0:2').ext).not.toHaveProperty('walls')
    expect((resetExt(painted(), 'masses.1.roof').ext as Params).masses).toEqual({ '1': { trim: { color: '#222222' } }, '2': { wall: { color: '#333333' } } })
    expect((resetExt(painted(), 'masses.2.wall').ext as Params).masses).toEqual({ '1': { roof: { color: '#111111' }, trim: { color: '#222222' } } })
    expect((resetExt(painted(), 'masses.1').ext as Params).masses).toEqual({ '2': { wall: { color: '#333333' } } })
    expect((resetExt(painted(), 'parts.rail').ext as Params).parts).toEqual({ wall: { kind: 'cedar' } })
    const last = resetExt(cabin({ parts: { rail: { style: 'steel' } } }), 'parts.rail')
    expect(last).not.toHaveProperty('ext')
    expect(last).toEqual({ ...cabin() })
  })

  test('with no key the whole exterior goes; an override that is not there changes nothing', () => {
    expect(resetExt(painted())).not.toHaveProperty('ext')
    const p = painted()
    expect(resetExt(p, 'parts.door')).toBe(p)
    expect(resetExt(p, 'masses.7.roof')).toBe(p)
    const plain = cabin()
    expect(resetExt(plain)).toBe(plain)
  })

  test('a malformed key is refused', () => {
    expect(() => resetExt(painted(), 'roof')).toThrow(/not an exterior override/)
    expect(() => resetExt(painted(), 'walls.0')).toThrow()
    expect(() => resetExt(painted(), 'parts.wall.kind')).toThrow()
  })
})

describe('extOverrides', () => {
  test('whole house first, then each mass, then each wall, each with its label and text', () => {
    const p = cabin({
      walls: { '2:0': { color: '#444444' }, '0:2': { kind: 'glass' }, '4:0': { color: '#555555' } },
      masses: { '3': { rail: { style: 'none' } }, '1': { trim: { color: '#222222' }, roof: { mat: '', color: '#111111' } } },
      parts: { rail: { style: 'cable' }, wall: { kind: 'cedar', color: '#9b6b43' } },
    })
    expect(extOverrides(p).map((r) => [r.key, r.label, r.text])).toEqual([
      ['parts.wall', 'Whole house · walls', 'cedar · #9b6b43'],
      ['parts.rail', 'Whole house · rails', 'cable rail'],
      ['masses.1.roof', 'porch 1 · roof', 'standard roof · #111111'],
      ['masses.1.trim', 'porch 1 · trim / fascia', '#222222'],
      ['masses.3.rail', 'deck 3 · rails', 'no rail'],
      ['walls.0:2', 'Main · front 3', 'glass'],
      ['walls.2:0', 'Wing 2 · back 1', '#444444'],
      ['walls.4:0', 'Wing 4 · curved wall', '#555555'],
    ])
    expect(extOverrides(p)[2]).toMatchObject({ scope: 'mass', part: 'roof', mi: 1, edge: null, fields: { mat: '', color: '#111111' } })
    expect(extOverrides(p)[5]).toMatchObject({ scope: 'element', part: 'wall', mi: 0, edge: 2 })
  })

  test('every row’s key resets it', () => {
    const p = cabin({ parts: { roof: { mat: 'sod' } }, masses: { '2': { wall: { kind: 'stone' } } }, walls: { '0:1': { color: '#123456' } } })
    const cleared = extOverrides(p).reduce((q, r) => resetExt(q, r.key), p)
    expect(cleared).not.toHaveProperty('ext')
  })

  test('a standalone deck labels its rows as the deck; nothing painted is an empty list', () => {
    const deck = { w: 10, d: 6, ext: { parts: { rail: { style: 'glass' }, post: { color: '#101010' } } } }
    expect(extOverrides(deck, 'deck').map((r) => r.label)).toEqual(['Deck · posts', 'Deck · rails'])
    expect(extOverrides(cabin())).toEqual([])
  })

  test('describeExt names painted walls, standard roofs and missing rails', () => {
    expect(describeExt({ kind: '', mat: '', style: 'none', color: '#000000' })).toBe('painted · standard roof · no rail · #000000')
  })
})

describe('presets', () => {
  test('the eight old presets, each on a part it applies to', () => {
    expect(EXT_PRESETS.map((p) => p.id)).toEqual(['cedar', 'charcoal', 'white', 'stone', 'copper', 'metal', 'sod', 'glass'])
    EXT_PRESETS.forEach((p) => Object.keys(p.fields).forEach((f) => expect(BRUSH_FIELDS[p.part]).toContain(f)))
  })

  test('a preset paints the chosen scope; with no focus, the whole house', () => {
    expect(applyPreset(cabin(), 'cedar').ext).toEqual({ parts: { wall: { kind: 'cedar', color: '#9b6b43' } } })
    expect(applyPreset(cabin(), 'stone', { scope: 'mass', part: 'wall', mi: 2, edge: 1 }).ext).toEqual({ masses: { '2': { foundation: { color: '#9a9184' } } } })
  })

  test('a wall preset on a focused wall paints that wall; on another part it paints the mass’s walls', () => {
    expect(applyPreset(cabin(), 'white', { scope: 'element', part: 'wall', mi: 0, edge: 1 }).ext).toEqual({ walls: { '0:1': { kind: 'board', color: '#e8e4da' } } })
    expect(applyPreset(cabin(), 'white', { scope: 'element', part: 'roof', mi: 0, edge: 1 }).ext).toEqual({ masses: { '0': { wall: { kind: 'board', color: '#e8e4da' } } } })
  })

  test('copper and sod drop a roof colour, so the finish shows its own', () => {
    const red = paintExt(cabin(), { scope: 'house', part: 'roof', fields: { color: '#aa0000' } })
    expect(applyPreset(red, 'copper').ext).toEqual({ parts: { roof: { mat: 'copper' } } })
    expect(extResolve(applyPreset(red, 'sod'), 0, 'roof')).toMatchObject({ mat: 'sod', color: '#3c4043', src: { mat: 'house', color: 'scheme' } })
  })

  test('an unknown preset is refused', () => {
    expect(() => applyPreset(cabin(), 'marble')).toThrow(/no exterior preset/)
  })
})

describe('parts', () => {
  test('stairs and ramps are painted as deck; unknown tags have no finish', () => {
    expect([extPartKey('stair'), extPartKey('ramp'), extPartKey('roof'), extPartKey('chimney')]).toEqual(['deck', 'deck', 'roof', null])
  })

  test('walls take kind and colour, roofs mat and colour, rails style and colour, the rest colour; a deck shows its own three', () => {
    expect(BRUSH_FIELDS.wall).toEqual(['kind', 'color'])
    expect(BRUSH_FIELDS.roof).toEqual(['color', 'mat'])
    expect(BRUSH_FIELDS.rail).toEqual(['color', 'style'])
    expect(BRUSH_FIELDS.foundation).toEqual(['color'])
    expect(DECK_PARTS).toEqual(['deck', 'post', 'rail'])
  })
})
