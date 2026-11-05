import { PATH_KINDS, KIND_LABELS, type PathKind } from '../paths/pieces'
import { PIECE_LIBRARY } from '../store/pathActions'
import type { ObjectId, PlanObject } from '../store/types'
import { ftToM } from '../site/units'

/**
 * The object library (old planner LIB, plus the 5C path pieces): what the
 * Place tool can put down, with the old planner's defaults. Sizes in feet;
 * `params` is what a placed object stores, minus its position and turn.
 */

export type LibraryGroup = 'buildings' | 'site' | 'trees' | 'paths'

export const LIBRARY_GROUPS: readonly { readonly id: LibraryGroup; readonly label: string }[] = [
  { id: 'buildings', label: 'Buildings' },
  { id: 'site', label: 'Site' },
  { id: 'trees', label: 'Trees' },
  { id: 'paths', label: 'Path pieces' },
]

export interface LibraryItem {
  readonly id: string
  readonly name: string
  /** One line under the name in the picker (old LIB hint). */
  readonly hint: string
  readonly group: LibraryGroup
  /** The plan object's type (old `t`). */
  readonly type: string
  readonly params: Readonly<Record<string, unknown>>
  /** Path pieces are placed by the path tools, which snap them to what they land on. */
  readonly pathKind?: PathKind
}

const item = (id: string, group: LibraryGroup, type: string, name: string, hint: string, params: Record<string, unknown>): LibraryItem => ({ id, group, type, name, hint, params })

const OBJECTS: readonly LibraryItem[] = [
  item('main-house', 'buildings', 'house', 'Main house', '40 × 28 · 1,120 sq ft', { w: 40, d: 28, h: 10, color: '#c7504b', roof: 'gable', pitch: 6, ridge: 'x', overhang: 1.5 }),
  item('guest-cabin', 'buildings', 'house', 'Guest cabin', '20 × 16 · 320 sq ft', { w: 20, d: 16, h: 9, color: '#d27f4a', roof: 'gable', pitch: 8, ridge: 'z', overhang: 1.5 }),
  item('shop', 'buildings', 'shop', 'Shop / garage', '24 × 24 · 576 sq ft', { w: 24, d: 24, h: 12, color: '#6f7f94', roof: 'gable', pitch: 4, ridge: 'x', overhang: 1 }),
  item('shed', 'buildings', 'shed', 'Shed', '10 × 12', { w: 10, d: 12, h: 7, color: '#7d8a6a', roof: 'gable', pitch: 6, ridge: 'z', overhang: 1 }),
  item('deck', 'buildings', 'deck', 'Deck', '16 × 12', { w: 16, d: 12, h: 1.5, color: '#b08a5a' }),
  item('driveway', 'site', 'pad', 'Driveway', '12 × 40 gravel', { w: 12, d: 40, h: 0.2, color: '#8c8c86' }),
  item('trailer-pad', 'site', 'pad', 'Trailer pad', '10 × 30', { w: 10, d: 30, h: 0.2, color: '#9a9a94' }),
  item('drainfield', 'site', 'septic', 'Drainfield reserve', 'keep clear of structures', { w: 30, d: 50, h: 0.1, color: '#b7c98e' }),
  item('garden', 'site', 'garden', 'Garden beds', '20 × 20', { w: 20, d: 20, h: 0.6, color: '#7ba360' }),
  item('boulder', 'site', 'boulder', 'Granite erratic', 'glacial boulder cluster', { w: 9, d: 7, h: 5, color: '#9b978f' }),
  item('meadow', 'site', 'meadow', 'Native meadow', 'grasses + camas, any shape', { w: 30, d: 20, h: 0.3, color: '#a7bf73' }),
  item('pond', 'site', 'pond', 'Rain-garden pond', 'reflecting pool, any shape', { w: 16, d: 10, h: 1.5, color: '#4f7f8c', shape: 'oct' }),
  item('pool', 'site', 'pool', 'Plunge pool', 'water + coping', { w: 12, d: 24, h: 1, color: '#3fb7c9' }),
  item('sky-bridge', 'site', 'bridge', 'Sky bridge', 'curving walkway · 12 ft up', { w: 6, d: 40, h: 4, color: '#e9e7e2', style: 'ribbon' }),
  item('madrone', 'trees', 'tree', 'Madrone (keep)', 'canopy 18 ft', { w: 18, d: 18, h: 28, color: '#4f7d4b', tree: true }),
  item('douglas-fir', 'trees', 'tree', 'Douglas fir', 'conifer · 55 ft', { w: 18, d: 18, h: 55, color: '#2f4f37', tree: true, species: 'fir' }),
  item('redcedar', 'trees', 'tree', 'Western redcedar', 'drooping conifer · 45 ft', { w: 20, d: 20, h: 45, color: '#46663b', tree: true, species: 'cedar' }),
  item('red-alder', 'trees', 'tree', 'Red alder', 'light round crown', { w: 18, d: 18, h: 35, color: '#7aa35a', tree: true, species: 'alder' }),
]

const PIECE_HINTS: Readonly<Record<PathKind, string>> = {
  walk: 'walk · follows the ground',
  ramp: 'ramp · 1:12 · rails + curbs',
  stair: 'stair · 7 in risers',
  landing: 'landing · level at the high end',
  boardwalk: 'boardwalk · on posts',
}

const PIECES: readonly LibraryItem[] = PATH_KINDS.map((kind) => {
  const lib = PIECE_LIBRARY[kind]
  const { w, d } = lib.params as { w: number; d: number }
  return { id: `path-${kind}`, group: 'paths', type: 'pad', name: lib.name || KIND_LABELS[kind], hint: `${w} × ${d} ${PIECE_HINTS[kind]}`, params: lib.params, pathKind: kind }
})

export const LIBRARY: readonly LibraryItem[] = [...OBJECTS, ...PIECES]

const BY_ID: ReadonlyMap<string, LibraryItem> = new Map(LIBRARY.map((i) => [i.id, i]))

export function libraryItem(id: string): LibraryItem {
  const found = BY_ID.get(id)
  if (!found) throw new Error(`unknown library item "${id}"`)
  return found
}

/** Old specCopy for a new bridge: 12 ft over the ground at its centre, 40 ft long, bowed 12 % of its length. */
const BRIDGE_CLEAR_FT = 12
const BRIDGE_BOW = 0.12
const BRIDGE_MIN_FT = 12

export interface PlaceSpec {
  readonly id: ObjectId
  readonly name: string
  /** Site metres. */
  readonly at: { readonly x: number; readonly n: number }
  readonly rotation: number
  /** Ground elevation in feet (NAVD88) at a site point, for a bridge's deck height. */
  readonly groundFt: (x: number, n: number) => number
}

/** A new plan object from a library item (not a path piece: those go through addPathPiece). */
export function buildLibraryObject(item: LibraryItem, spec: PlaceSpec): PlanObject {
  const params: Record<string, unknown> = structuredClone({ ...item.params })
  const base = { id: spec.id, type: item.type, name: spec.name, position: { x: spec.at.x, n: spec.at.n }, locked: false, hidden: false, labelVisible: true }
  if (item.type !== 'bridge') return { ...base, rotation: spec.rotation, params }
  // the old planner lays a new bridge east-west and ignores the turn; its route is stored relative to the centre
  const L = ftToM(Math.max(BRIDGE_MIN_FT, Number(params.d) || 40))
  const E = spec.groundFt(spec.at.x, spec.at.n) + BRIDGE_CLEAR_FT
  const mid = (L * BRIDGE_BOW) / 2
  const route = [
    [-L / 2, -mid, E],
    [0, mid, E + 1],
    [L / 2, -mid, E],
  ]
  return { ...base, rotation: 0, params: { ...params, route } }
}
