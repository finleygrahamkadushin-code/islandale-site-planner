import { CURVED_SHAPES } from './footprint'
import { ROOF_FINISH_LIST, WALL_KIND_LIST, isRoofFinish, isWallKind, wallKindColour, type RoofFinish, type WallKind } from './finishes'
import { buildingMasses, massPoly, wingSlots, type Mass } from './masses'
import { wallLabel } from './openingEdits'

/**
 * A building's exterior paint, stored the way the old planner stores it
 * (legacy ext:ext-tag and ext:ext-panel) so both planners read the same data:
 *   params.ext = {
 *     parts?:  { [part]: fields },            the whole building
 *     masses?: { "mi": { [part]: fields } },  one mass (0 the main walls, n the n-th wing)
 *     walls?:  { "mi:edge": fields },         one wall of one mass
 *   }
 * Walls take kind and color, roofs mat and color, rails style and color,
 * every other part color. A value is read most specific first: the wall,
 * its mass, the building, then the scheme's own fields (walls, color,
 * roofColor, roofMat, glassTint), then the defaults. 5A's rail style
 * (ext.parts.rail.style) is the same data. Every edit returns new params.
 */

type Params = Record<string, unknown>
const isRecord = (v: unknown): v is Params => typeof v === 'object' && v !== null && !Array.isArray(v)
const recordOf = (v: unknown): Params => (isRecord(v) ? v : {})

/** The parts a building's exterior is painted by (legacy ext-panel PARTS). */
export const EXT_PARTS = ['wall', 'roof', 'trim', 'deck', 'post', 'door', 'glass', 'foundation', 'rail', 'slab'] as const
export type ExtPart = (typeof EXT_PARTS)[number]
/** A part as a drawn piece is tagged; stairs and ramps are painted as deck. */
export type ExtTagPart = ExtPart | 'stair' | 'ramp'
/** The parts a standalone deck shows in the panel. */
export const DECK_PARTS: readonly ExtPart[] = ['deck', 'post', 'rail']

/** The panel's name for each part (legacy PART_LABEL). */
export const PART_LABELS: Readonly<Record<ExtPart, string>> = {
  wall: 'walls',
  roof: 'roof',
  trim: 'trim / fascia',
  deck: 'deck boards',
  post: 'posts',
  door: 'doors',
  glass: 'window glass',
  foundation: 'foundation',
  rail: 'rails',
  slab: 'floor slab',
}

export const RAIL_STYLES = ['wood', 'steel', 'cable', 'glass', 'none'] as const
export type RailStyle = (typeof RAIL_STYLES)[number]

/** Stored fields of one override; '' is a real value for kind (painted) and mat (standard roof). */
export interface ExtFields {
  readonly kind?: WallKind | ''
  readonly color?: string
  readonly mat?: RoofFinish | ''
  readonly style?: RailStyle
}
export type ExtField = keyof ExtFields
/** A paint: each field given is set, null removes it, a field the part does not take is ignored. */
export type ExtPatch = { readonly [F in ExtField]?: ExtFields[F] | null }

/** The fields the brush sets on each part (legacy EXT_PART_FIELDS; every other part takes colour only). */
export const BRUSH_FIELDS: Readonly<Record<ExtPart, readonly ExtField[]>> = {
  wall: ['kind', 'color'],
  roof: ['color', 'mat'],
  rail: ['color', 'style'],
  trim: ['color'],
  deck: ['color'],
  post: ['color'],
  door: ['color'],
  glass: ['color'],
  foundation: ['color'],
  slab: ['color'],
}

/** The choices for each brush select, in the old panel's order. */
export const BRUSH_OPTIONS = {
  kind: ['', ...WALL_KIND_LIST] as readonly (WallKind | '')[],
  mat: ['', ...ROOF_FINISH_LIST] as readonly (RoofFinish | '')[],
  style: RAIL_STYLES,
} as const

/** How far a paint reaches: one wall (or, for other parts, the mass), the mass, or the whole building. */
export type ExtScope = 'element' | 'mass' | 'house'
export const EXT_SCOPES: readonly ExtScope[] = ['element', 'mass', 'house']
/** Where a resolved value came from: an override scope, the scheme's own fields, a default, or the rail style. */
export type ExtSource = ExtScope | 'scheme' | 'default' | 'style'
/** A building (masses from its params) or a standalone deck (legacy o.t 'deck', no masses). */
export type ExtHost = 'building' | 'deck'

/** Legacy defaults (ext-tag DEF); walls fall back to the new app's cabin colour (buildingLook). */
export const EXT_DEFAULT_COLOURS = {
  wall: '#c4a77d',
  deck: '#c9ad84',
  post: '#6e5a44',
  door: '#5a4634',
  glass: '#8fb8c9',
  foundation: '#8a8780',
  slab: '#cfc7b8',
} as const
/** Steel and cable rails are steel unless painted. */
const STEEL = '#3b3f44'
/** A roof with no colour of its own is the wall colour darkened this much (legacy roofMat0, extResolve). */
const ROOF_SHADE = 0.55

const HEX = /^#[0-9a-f]{6}$/i
const isHex = (v: unknown): v is string => typeof v === 'string' && HEX.test(v)
const VALID: Readonly<Record<ExtField, (v: unknown) => boolean>> = {
  kind: (v) => v === '' || isWallKind(v),
  mat: (v) => v === '' || isRoofFinish(v),
  style: (v) => (RAIL_STYLES as readonly unknown[]).includes(v),
  color: isHex,
}

/** The storage part for a tagged part: stair and ramp paint as deck; anything else unknown is null (legacy extPartKey). */
export function extPartKey(part: string): ExtPart | null {
  if (part === 'stair' || part === 'ramp') return 'deck'
  return (EXT_PARTS as readonly string[]).includes(part) ? (part as ExtPart) : null
}

// ---------- reading ----------

/** The raw params of mass mi: the building itself for 0, its n-th well-formed wing for n; null for a standalone deck or a missing wing. */
function rawMass(params: Params, mi: number, host: ExtHost): Params | null {
  if (host === 'deck') return null
  if (mi === 0) return params
  const slot = wingSlots(params)[mi - 1]
  return slot === undefined ? null : (params.wings as Params[])[slot]
}

/** A curved mass has one wall all the way round, stored and read as edge 0 (legacy curved wall tag). */
function wallKey(params: Params, mi: number, edge: number): string {
  const m = rawMass(params, mi, 'building')
  const curved = m !== null && (CURVED_SHAPES as readonly unknown[]).includes(m.shape)
  return `${mi}:${curved ? 0 : edge}`
}

interface Layer {
  readonly scope: ExtScope
  readonly fields: Params
}

/** The overrides that apply to (mi, part, edge), most specific first (legacy scopes). */
function layers(params: Params, mi: number, part: ExtPart, edge: number | null): Layer[] {
  if (!isRecord(params.ext)) return []
  const ext = params.ext
  const out: Layer[] = []
  const wall = part === 'wall' && edge !== null ? recordOf(ext.walls)[wallKey(params, mi, edge)] : undefined
  if (isRecord(wall)) out.push({ scope: 'element', fields: wall })
  const mass = recordOf(recordOf(ext.masses)[String(mi)])[part]
  if (isRecord(mass)) out.push({ scope: 'mass', fields: mass })
  const house = recordOf(ext.parts)[part]
  if (isRecord(house)) out.push({ scope: 'house', fields: house })
  return out
}

interface Picked<T> {
  readonly v: T
  readonly scope: ExtScope
}

/** The first valid value of `field` along the layers; an invalid stored value is passed over. */
function pick<T>(ls: readonly Layer[], field: ExtField): Picked<T> | null {
  for (const l of ls) if (VALID[field](l.fields[field])) return { v: l.fields[field] as T, scope: l.scope }
  return null
}

/** The scheme's wall kind: the mass's own walls, else the building's (legacy specWallKind); '' is painted. */
function schemeWallKind(m: Params | null, params: Params): WallKind | '' {
  if (!m) return ''
  const k = m.walls || params.walls
  return isWallKind(k) ? k : ''
}

/** The scheme's roof finish: the mass's own roofMat, else sod for a sod roof (legacy roofMatOf; wings do not take the building's). */
function schemeRoofMat(m: Params | null): RoofFinish | '' {
  if (!m) return ''
  const r = m.roofMat ?? (m.roof === 'sod' ? 'sod' : undefined)
  return isRoofFinish(r) ? r : ''
}

const firstHex = (...vs: unknown[]): string | null => (vs.find(isHex) as string | undefined) ?? null

/** `#rrggbb` with each channel times f, clamped (legacy shade). */
function shade(hex: string, f: number): string {
  const v = parseInt(hex.slice(1), 16)
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((v >> s) & 255) * f)))
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`
}

/** One element's look (legacy extResolve). */
export interface ExtResolved {
  readonly part: ExtTagPart
  readonly color: string
  /** Walls only: a wall kind, or '' for painted (the building's own siding). */
  readonly kind: WallKind | ''
  /** Roofs only: a finish, or '' for the roof type's own surface. */
  readonly mat: RoofFinish | ''
  /** Rails only: the style, wood by default. */
  readonly style: RailStyle | ''
  /** Walls only: the glass tint of a glass wall (window glass paint, else the scheme's glassTint). */
  readonly tint: string | null
  /** Some exterior override changes this element; false means the scheme's own look applies. */
  readonly ov: boolean
  readonly src: Readonly<Partial<Record<ExtField, ExtSource>>>
  /** The part whose colour this one follows (trim and an unpainted roof follow the wall, rails the trim or posts, stairs the deck). */
  readonly via?: ExtTagPart
}

const blank = { kind: '', mat: '', style: '', tint: null } as const

/**
 * The look of one element: part of mass mi (0 the main walls, n the n-th
 * wing), and for a wall its edge. Most specific first, then the scheme's
 * own fields, then the defaults; a stored value that is not valid is passed
 * over. A standalone deck is host 'deck'.
 */
export function extResolve(params: Params, mi: number, part: ExtTagPart, edge: number | null = null, host: ExtHost = 'building'): ExtResolved {
  const i = Math.max(0, Math.trunc(mi) || 0)
  const ctx: Ctx = { params, mi: i, m: rawMass(params, i, host), host }
  if (part === 'stair' || part === 'ramp') {
    const d = resolveColour(ctx, 'deck')
    return { ...d, part, src: { color: d.src.color }, via: 'deck' }
  }
  if (part === 'wall') return resolveWall(ctx, edge)
  if (part === 'roof') return resolveRoof(ctx)
  if (part === 'trim') return resolveTrim(ctx)
  if (part === 'rail') return resolveRail(ctx)
  return resolveColour(ctx, part)
}

interface Ctx {
  readonly params: Params
  readonly mi: number
  readonly m: Params | null
  readonly host: ExtHost
}

/** The scheme's wall colour: the mass's own, else the building's (legacy m.color || o.color). */
const schemeWall = (c: Ctx): string | null => firstHex(c.m?.color, c.params.color)

function resolveWall(c: Ctx, edge: number | null): ExtResolved {
  const ls = layers(c.params, c.mi, 'wall', edge)
  const k = pick<WallKind | ''>(ls, 'kind')
  const col = pick<string>(ls, 'color')
  const glass = pick<string>(layers(c.params, c.mi, 'glass', null), 'color')
  const kind = k ? k.v : schemeWallKind(c.m, c.params)
  const scheme = schemeWall(c)
  return {
    ...blank,
    part: 'wall',
    kind,
    color: col?.v ?? scheme ?? (kind ? wallKindColour(kind) : EXT_DEFAULT_COLOURS.wall),
    tint: glass?.v ?? firstHex(c.params.glassTint),
    ov: !!(k || col || (kind === 'glass' && glass)),
    src: { kind: k ? k.scope : kind ? 'scheme' : 'default', color: col ? col.scope : scheme ? 'scheme' : 'default' },
  }
}

function resolveRoof(c: Ctx): ExtResolved {
  const ls = layers(c.params, c.mi, 'roof', null)
  const mt = pick<RoofFinish | ''>(ls, 'mat')
  const own = pick<string>(ls, 'color')
  const mat = mt ? mt.v : schemeRoofMat(c.m)
  const base = { ...blank, part: 'roof' as const, mat }
  const matSrc: ExtSource = mt ? mt.scope : mat ? 'scheme' : 'default'
  const schemeRoof = firstHex(c.m?.roofColor, c.params.roofColor)
  if (own || schemeRoof) {
    return { ...base, color: own?.v ?? (schemeRoof as string), ov: !!(own || mt), src: { mat: matSrc, color: own ? own.scope : 'scheme' } }
  }
  // no roof colour anywhere: the wall colour darkened, painted or the scheme's
  const wall = pick<string>(layers(c.params, c.mi, 'wall', null), 'color')
  const scheme = schemeWall(c)
  const wc = wall?.v ?? scheme ?? EXT_DEFAULT_COLOURS.wall
  const wsrc: ExtSource = wall ? wall.scope : scheme ? 'scheme' : 'default'
  return { ...base, color: shade(wc, ROOF_SHADE), ov: !!(wall || mt), src: { mat: matSrc, color: wsrc }, via: 'wall' }
}

/** Trim takes its own paint, else the wall paint of the mass or building, else the scheme's wall colour. */
function resolveTrim(c: Ctx): ExtResolved {
  const own = pick<string>(layers(c.params, c.mi, 'trim', null), 'color')
  if (own) return { ...blank, part: 'trim', color: own.v, ov: true, src: { color: own.scope } }
  const wall = pick<string>(layers(c.params, c.mi, 'wall', null), 'color')
  const scheme = schemeWall(c)
  return {
    ...blank,
    part: 'trim',
    color: wall?.v ?? scheme ?? EXT_DEFAULT_COLOURS.wall,
    ov: !!wall,
    src: { color: wall ? wall.scope : scheme ? 'scheme' : 'default' },
    via: 'wall',
  }
}

/** Rails: their style (wood by default); colour their own, else steel for steel and cable, else the posts (decks) or trim. */
function resolveRail(c: Ctx): ExtResolved {
  const ls = layers(c.params, c.mi, 'rail', null)
  const s = pick<RailStyle>(ls, 'style')
  const style = s ? s.v : 'wood'
  const styleOv = !!s && style !== 'wood'
  const deckish = c.host === 'deck' || c.m?.kind === 'deck'
  const base = deckish ? resolveColour(c, 'post') : resolveTrim(c)
  const own = pick<string>(ls, 'color')
  const styleSrc: ExtSource = s ? s.scope : 'default'
  const out = { ...blank, part: 'rail' as const, style, ov: !!own || styleOv || base.ov }
  if (own) return { ...out, color: own.v, src: { style: styleSrc, color: own.scope } }
  if (style === 'steel' || style === 'cable') return { ...out, color: STEEL, src: { style: styleSrc, color: 'style' } }
  return { ...out, color: base.color, src: { style: styleSrc, color: base.src.color }, via: base.part }
}

/** Every colour-only part: its paint, else the scheme (a standalone deck's colour for its boards), else the default. */
function resolveColour(c: Ctx, part: Exclude<ExtPart, 'wall' | 'roof' | 'trim' | 'rail'>): ExtResolved {
  const own = pick<string>(layers(c.params, c.mi, part, null), 'color')
  const scheme = part === 'deck' && c.host === 'deck' ? firstHex(c.params.color) : null
  const color = own?.v ?? scheme ?? EXT_DEFAULT_COLOURS[part]
  return { ...blank, part, color, ov: !!own, src: { color: own ? own.scope : scheme ? 'scheme' : 'default' } }
}

// ---------- writing ----------

/** Where a write lands (legacy slot): one wall, one part of one mass, or one part of the building. */
type Slot = { readonly sect: 'walls'; readonly key: string } | { readonly sect: 'masses'; readonly key: string; readonly part: ExtPart } | { readonly sect: 'parts'; readonly part: ExtPart }

function readSlot(ext: Params, s: Slot): Params {
  if (s.sect === 'walls') return recordOf(recordOf(ext.walls)[s.key])
  if (s.sect === 'masses') return recordOf(recordOf(recordOf(ext.masses)[s.key])[s.part])
  return recordOf(recordOf(ext.parts)[s.part])
}

function writeSlot(ext: Params, s: Slot, fields: Params): Params {
  if (s.sect === 'walls') return { ...ext, walls: { ...recordOf(ext.walls), [s.key]: fields } }
  if (s.sect === 'parts') return { ...ext, parts: { ...recordOf(ext.parts), [s.part]: fields } }
  const masses = recordOf(ext.masses)
  return { ...ext, masses: { ...masses, [s.key]: { ...recordOf(masses[s.key]), [s.part]: fields } } }
}

const nonEmpty = (v: unknown): v is Params => isRecord(v) && Object.keys(v).length > 0
/** A map without its empty (or malformed) entries; undefined when nothing is left. */
function pruneMap(r: unknown, inner: (v: unknown) => unknown = (v) => v): Params | undefined {
  if (!isRecord(r)) return undefined
  const kept = Object.entries(r).flatMap(([k, v]) => {
    const q = inner(v)
    return nonEmpty(q) ? [[k, q] as const] : []
  })
  return kept.length ? Object.fromEntries(kept) : undefined
}

/** ext without empty parts, walls and masses (legacy prune); null when nothing is left. Other keys are kept. */
function prune(ext: Params): Params | null {
  const { parts, walls, masses, ...rest } = ext
  const kept: Params = {
    ...rest,
    ...optional('parts', pruneMap(parts)),
    ...optional('walls', pruneMap(walls)),
    ...optional('masses', pruneMap(masses, (m) => pruneMap(m))),
  }
  return Object.keys(kept).length ? kept : null
}

const optional = (key: string, v: Params | undefined): Params => (v ? { [key]: v } : {})

/** params with this exterior, or without one when it is null. */
function withExt(params: Params, ext: Params | null): Params {
  const { ext: _old, ...rest } = params
  return ext ? { ...rest, ext } : rest
}

const sameFields = (a: Params, b: Params): boolean => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => k in b && a[k] === b[k])

export interface PaintRequest {
  readonly scope: ExtScope
  /** The part painted, as tagged; stair and ramp paint the deck. */
  readonly part: ExtTagPart
  /** The mass; null or missing paints the whole building whatever the scope. */
  readonly mi?: number | null
  /** The wall, for an element-scope wall paint; without one the paint lands on the mass. */
  readonly edge?: number | null
  readonly fields: ExtPatch
}

/** The mass count and, for a wall, the edge count, refusing indexes that are not there. */
function checkTarget(params: Params, mi: number | null, edge: number | null, wall: boolean): void {
  if (mi === null) return
  const count = 1 + wingSlots(params).length
  if (!Number.isInteger(mi) || mi < 0 || mi >= count) throw new Error(`no mass ${mi}`)
  if (!wall || edge === null) return
  const m: Mass = buildingMasses(params)[mi]
  const n = massPoly(m).length
  if (!Number.isInteger(edge) || edge < 0 || edge >= n) throw new Error(`no wall ${edge} of ${n} on mass ${mi}`)
}

function slotOf(params: Params, scope: ExtScope, part: ExtPart, mi: number | null, edge: number | null): Slot {
  if (scope === 'element' && part === 'wall' && mi !== null && edge !== null) return { sect: 'walls', key: wallKey(params, mi, edge) }
  if (scope !== 'house' && mi !== null) return { sect: 'masses', key: String(mi), part }
  return { sect: 'parts', part }
}

/** The slot's fields with the patch applied: fields the part does not take are ignored, a bad value is refused. */
function patched(cur: Params, part: ExtPart, patch: ExtPatch, slot: Slot): Params {
  return BRUSH_FIELDS[part].reduce<Params>((acc, f) => {
    if (!(f in patch) || patch[f] === undefined) return acc
    const v = patch[f]
    const { [f]: _old, ...rest } = acc
    if (v === null) return rest
    if (!VALID[f](v)) throw new Error(`"${String(v)}" is not a ${f} for the ${part}`)
    // wood is the building's default rail and is never stored for it (railEdits withRailStyle)
    if (f === 'style' && v === 'wood' && slot.sect === 'parts') return rest
    return { ...rest, [f]: f === 'color' ? (v as string).toLowerCase() : v }
  }, cur)
}

/**
 * Paint one element, one mass or the whole building (legacy extApply). The
 * element scope paints one wall when a wall and its edge are given, and the
 * mass otherwise; without a mass every scope paints the building. Returns
 * `params` itself when nothing changes, and drops emptied objects.
 */
export function paintExt(params: Params, req: PaintRequest): Params {
  const part = extPartKey(req.part)
  if (!part) throw new Error(`"${req.part}" has no exterior finish`)
  const mi = req.mi ?? null
  const edge = req.edge ?? null
  checkTarget(params, mi, edge, part === 'wall' && req.scope === 'element')
  const slot = slotOf(params, req.scope, part, mi, edge)
  const ext = recordOf(params.ext)
  const cur = readSlot(ext, slot)
  const next = patched(cur, part, req.fields, slot)
  if (sameFields(cur, next)) return params
  return withExt(params, prune(writeSlot(ext, slot, next)))
}

const RESET_KEY = /^(?:(parts)\.([a-z]+)|(walls)\.(\d+:\d+)|(masses)\.(\d+)(?:\.([a-z]+))?)$/

/**
 * Remove one override by its row key ('parts.roof', 'walls.0:2',
 * 'masses.1.roof', or 'masses.1' for all of a mass), or with no key the
 * whole exterior (legacy extRemove and Reset exterior). Emptied objects go.
 */
export function resetExt(params: Params, key?: string): Params {
  if (key === undefined) return isRecord(params.ext) || 'ext' in params ? withExt(params, null) : params
  const k = RESET_KEY.exec(key)
  if (!k) throw new Error(`"${key}" is not an exterior override`)
  const ext = recordOf(params.ext)
  const without = (r: unknown, name: string): Params | null => {
    const map = recordOf(r)
    if (!(name in map)) return null
    const { [name]: _gone, ...rest } = map
    return rest
  }
  let next: Params | null = null
  if (k[1]) next = mapped(ext, 'parts', without(ext.parts, k[2]))
  else if (k[3]) next = mapped(ext, 'walls', without(ext.walls, k[4]))
  else if (!k[7]) next = mapped(ext, 'masses', without(ext.masses, k[6]))
  else {
    const mass = without(recordOf(ext.masses)[k[6]], k[7])
    next = mass && mapped(ext, 'masses', { ...recordOf(ext.masses), [k[6]]: mass })
  }
  return next ? withExt(params, prune(next)) : params
}

const mapped = (ext: Params, sect: string, map: Params | null): Params | null => (map ? { ...ext, [sect]: map } : null)

// ---------- the panel ----------

/** One row of the panel's overrides list (legacy extOverridesList). */
export interface ExtOverrideRow {
  /** The key resetExt takes. */
  readonly key: string
  readonly scope: ExtScope
  readonly part: ExtPart
  readonly mi: number | null
  readonly edge: number | null
  /** The part's valid stored fields. */
  readonly fields: ExtFields
  /** "Whole house · roof", "Main · walls", "Wing 2 · front 3", "Deck · rails". */
  readonly label: string
  /** "cedar · #9b6b43", "copper roof", "no rail". */
  readonly text: string
}

/** "painted", "copper roof", "no rail", the colour, joined by middle dots (legacy describe). */
export function describeExt(f: ExtFields): string {
  const bits: string[] = []
  if (f.kind !== undefined) bits.push(f.kind === '' ? 'painted' : f.kind)
  if (f.mat !== undefined) bits.push(f.mat === '' ? 'standard roof' : `${f.mat} roof`)
  if (f.style !== undefined) bits.push(f.style === 'none' ? 'no rail' : `${f.style} rail`)
  if (f.color !== undefined) bits.push(f.color)
  return bits.join(' · ')
}

/** "Main", "Wing 2", "porch 1", as the old panel and wallLabel name masses. */
function massName(m: Mass | undefined, mi: number): string {
  if (mi === 0) return 'Main'
  return !m || m.kind === 'wall' ? `Wing ${mi}` : `${m.kind} ${mi}`
}

const validFields = (part: ExtPart, raw: Params): ExtFields =>
  Object.fromEntries(BRUSH_FIELDS[part].filter((f) => VALID[f](raw[f])).map((f) => [f, raw[f]])) as ExtFields

const byPart = (a: string, b: string) => EXT_PARTS.indexOf(a as ExtPart) - EXT_PARTS.indexOf(b as ExtPart)
const knownParts = (r: Params): ExtPart[] => (Object.keys(r).filter((k) => extPartKey(k) === k && nonEmpty(r[k])) as ExtPart[]).sort(byPart)

/** Every override, whole building first, then each mass, then each wall, with its label and text. */
export function extOverrides(params: Params, host: ExtHost = 'building'): ExtOverrideRow[] {
  if (!isRecord(params.ext)) return []
  const ext = params.ext
  const masses = host === 'deck' ? [] : buildingMasses(params)
  const name = (scope: ExtScope, part: ExtPart, mi: number | null) =>
    host === 'deck' ? `Deck · ${PART_LABELS[part]}` : `${scope === 'house' ? 'Whole house' : massName(masses[mi ?? 0], mi ?? 0)} · ${PART_LABELS[part]}`
  const row = (key: string, scope: ExtScope, part: ExtPart, mi: number | null, edge: number | null, raw: Params, label: string): ExtOverrideRow => {
    const fields = validFields(part, raw)
    return { key, scope, part, mi, edge, fields, label, text: describeExt(fields) }
  }
  const parts = recordOf(ext.parts)
  const houseRows = knownParts(parts).map((p) => row(`parts.${p}`, 'house', p, null, null, parts[p] as Params, name('house', p, null)))
  const massMap = recordOf(ext.masses)
  const massRows = Object.keys(massMap)
    .filter((k) => /^\d+$/.test(k) && isRecord(massMap[k]))
    .sort((a, b) => Number(a) - Number(b))
    .flatMap((k) => {
      const M = massMap[k] as Params
      const mi = Number(k)
      return knownParts(M).map((p) => row(`masses.${k}.${p}`, 'mass', p, mi, null, M[p] as Params, name('mass', p, mi)))
    })
  const wallMap = recordOf(ext.walls)
  const wallRows = Object.keys(wallMap)
    .filter((k) => /^\d+:\d+$/.test(k) && nonEmpty(wallMap[k]))
    .map((k) => [k, ...k.split(':').map(Number)] as const)
    .sort((a, b) => a[1] - b[1] || a[2] - b[2])
    .map(([k, mi, ei]) => row(`walls.${k}`, 'element', 'wall', mi, ei, wallMap[k] as Params, wallName(params, masses, mi, ei)))
  return [...houseRows, ...massRows, ...wallRows]
}

/** "Main · front 3", "porch 1 · curved wall", or "Wing 4 · wall 2" for a mass that is not there (legacy wallName). */
function wallName(params: Params, masses: readonly Mass[], mi: number, ei: number): string {
  const m = masses[mi]
  if (!m) return `${massName(undefined, mi)} · wall ${ei + 1}`
  return wallLabel(params, mi, (CURVED_SHAPES as readonly string[]).includes(m.shape) ? 'along' : ei)
}

/** A one-click finish (legacy EXT_PRESETS, the eight Lopez-appropriate ones). */
export interface ExtPreset {
  readonly id: string
  readonly label: string
  readonly part: ExtPart
  readonly fields: ExtPatch
}

export const EXT_PRESETS: readonly ExtPreset[] = [
  { id: 'cedar', label: 'Cedar', part: 'wall', fields: { kind: 'cedar', color: '#9b6b43' } },
  { id: 'charcoal', label: 'Charcoal board', part: 'wall', fields: { kind: 'board', color: '#3b3f42' } },
  { id: 'white', label: 'White board', part: 'wall', fields: { kind: 'board', color: '#e8e4da' } },
  { id: 'stone', label: 'Stone base', part: 'foundation', fields: { color: '#9a9184' } },
  { id: 'copper', label: 'Copper roof', part: 'roof', fields: { mat: 'copper', color: null } },
  { id: 'metal', label: 'Metal roof', part: 'roof', fields: { mat: 'metal', color: '#4b5154' } },
  { id: 'sod', label: 'Sod roof', part: 'roof', fields: { mat: 'sod', color: null } },
  { id: 'glass', label: 'Glass wall', part: 'wall', fields: { kind: 'glass', color: null } },
]

/** What the panel is focused on when a preset is applied. */
export interface PresetFocus {
  readonly scope: ExtScope
  readonly part?: ExtTagPart
  readonly mi?: number | null
  readonly edge?: number | null
}

/**
 * Apply a preset at the chosen scope, on the preset's own part of the
 * focused mass, and on the focused wall when a wall preset meets a focused
 * wall (legacy extApplyPreset). Without a focus it paints the whole building.
 */
export function applyPreset(params: Params, presetId: string, focus: PresetFocus = { scope: 'house' }): Params {
  const p = EXT_PRESETS.find((q) => q.id === presetId)
  if (!p) throw new Error(`no exterior preset "${presetId}"`)
  const sameWall = p.part === 'wall' && focus.part !== undefined && extPartKey(focus.part) === 'wall'
  return paintExt(params, { scope: focus.scope, part: p.part, mi: focus.mi, edge: sameWall ? focus.edge : null, fields: p.fields })
}
