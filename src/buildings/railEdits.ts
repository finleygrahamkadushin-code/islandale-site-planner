/**
 * Pure edits to rails, stored the way the old planner stores them so both
 * planners read the same data:
 * - per-edge overrides on the wing (or standalone deck) as `rails`
 *   { [edge]: true | false }, a missing edge meaning auto; the legacy
 *   whole-wing `rail` flag (true, false, 'sides') goes once a map exists;
 * - the rail style per building at params.ext.parts.rail.style ('wood' is
 *   the default and is never stored).
 * `src` below is the raw wing, or a standalone deck's own params.
 */

type Params = Record<string, unknown>
const isRecord = (v: unknown): v is Params => typeof v === 'object' && v !== null && !Array.isArray(v)

export type RailState = 'auto' | 'on' | 'off'
export const RAIL_STYLES = ['wood', 'steel', 'cable', 'glass', 'none'] as const
export type RailStyle = (typeof RAIL_STYLES)[number]
/** Outlines with more edges than this are curves, where 'sides' has no ends to leave open. */
const CURVED_EDGES = 24

/** What is drawn on one edge in each regime, from the scene's own rules. */
export interface EdgeDraw {
  /** Drawn now, under the whole-wing legacy rule (the wing has no `rails` map). */
  readonly legacy: boolean
  /** Would be drawn with the edge left on auto under the per-edge rule. */
  readonly auto: boolean
  /** No other part of the building covers the edge (legacy edgeFree); "All on/off" skips covered edges. */
  readonly free: boolean
}

/** A stored per-edge value: true, false, or undefined for auto. Keys may be numbers or, once saved, strings. */
function railAt(r: unknown, i: number): boolean | undefined {
  if (!isRecord(r)) return undefined
  const v = r[i] ?? r[String(i)]
  return typeof v === 'boolean' ? v : undefined
}

/** Whether `src` has a per-edge map, so the per-edge rule decides its rails. */
export function hasRailMap(src: Params): boolean {
  return isRecord(src.rails)
}

/** The state of edge i of n (legacy railEdit.stateOf): the map first, then the old flag, else auto. */
export function stateOf(rails: unknown, legacy: unknown, i: number, n: number): RailState {
  const v = railAt(rails, i)
  if (v === true) return 'on'
  if (v === false) return 'off'
  if (legacy === false) return 'off'
  if (legacy === true) return 'on'
  if (legacy === 'sides') return i % 2 === 1 && n <= CURVED_EDGES ? 'off' : 'on'
  return 'auto'
}

/**
 * Every edge's state for a wing or deck with n edges, as the panel and chips
 * show it. A wing with no map is all auto: what it draws comes from the
 * whole-wing rule, and its first write keeps exactly that (materialise).
 */
export function railStates(src: Params, n: number): RailState[] {
  if (!hasRailMap(src)) return Array.from({ length: n }, () => 'auto')
  return Array.from({ length: n }, (_, i) => stateOf(src.rails, src.rail, i, n))
}

/** auto → on → off → auto, as a rail chip cycles. */
export function cycle(s: RailState): RailState {
  return s === 'auto' ? 'on' : s === 'on' ? 'off' : 'auto'
}

/** `src` without the legacy flag and with this map. */
function withMap(src: Params, rails: Record<string, boolean>): Params {
  const { rail: _flag, ...rest } = src
  return { ...rest, rails }
}

/**
 * The first per-edge write turns the whole-wing rule into a map that draws
 * exactly what is drawn now: an edge whose legacy rail differs from what
 * auto would draw is stored on or off, every other edge stays auto, and the
 * legacy flag goes. Legacy materialize froze the flag alone, which takes
 * the rails off low deck edges, so without `draws` for every edge this
 * refuses. A wing that already has a map is returned as it is.
 */
export function materialise(src: Params, n: number, draws: readonly EdgeDraw[] | null): Params {
  if (hasRailMap(src)) return src
  if (!draws || draws.length !== n) throw new Error(`the first per-edge rail write needs what each of the ${n} edges draws`)
  const rails: Record<string, boolean> = {}
  draws.forEach((d, i) => {
    if (d.legacy !== d.auto) rails[i] = d.legacy
  })
  return withMap(src, rails)
}

/** Set one edge on, off or auto, materialising the map first. */
export function writeEdge(src: Params, i: number, state: RailState, n: number, draws: readonly EdgeDraw[] | null): Params {
  if (!Number.isInteger(i) || i < 0 || i >= n) throw new Error(`no edge ${i} of ${n}`)
  const base = materialise(src, n, draws)
  const { [String(i)]: _old, ...rest } = base.rails as Record<string, boolean>
  return withMap(base, state === 'auto' ? rest : { ...rest, [i]: state === 'on' })
}

/** Every free edge on or off, or every edge back to auto (legacy writeAll); `free` null means all free. */
export function writeAll(src: Params, mode: RailState, n: number, free: readonly boolean[] | null): Params {
  const rails: Record<string, boolean> = {}
  if (mode !== 'auto') for (let i = 0; i < n; i++) if (free?.[i] !== false) rails[i] = mode === 'on'
  return withMap(src, rails)
}

const asStyle = (v: unknown): RailStyle | undefined => (RAIL_STYLES.includes(v as RailStyle) ? (v as RailStyle) : undefined)
const railStyleIn = (scope: unknown): RailStyle | undefined => (isRecord(scope) && isRecord(scope.rail) ? asStyle(scope.rail.style) : undefined)

/** The building's own rail style (ext.parts.rail.style), the one the Railings panel sets. */
export function buildingRailStyle(params: Params): RailStyle {
  return railStyleIn(isRecord(params.ext) ? params.ext.parts : undefined) ?? 'wood'
}

/** The rail style of mass mi: its own exterior setting, then the building's, then wood (legacy extResolve). */
export function railStyleOf(params: Params, mi: number): RailStyle {
  const ext = isRecord(params.ext) ? params.ext : {}
  const masses = isRecord(ext.masses) ? ext.masses : {}
  return railStyleIn(masses[String(mi)]) ?? buildingRailStyle(params)
}

/** The building's rail style (ext.parts.rail.style); wood removes it, and emptied objects go too. */
export function withRailStyle(params: Params, style: RailStyle): Params {
  if (!asStyle(style)) throw new Error(`unknown rail style "${style}"`)
  const ext = isRecord(params.ext) ? params.ext : {}
  const parts = isRecord(ext.parts) ? ext.parts : {}
  const { style: _old, ...rail } = isRecord(parts.rail) ? parts.rail : {}
  const nextRail = style === 'wood' ? rail : { ...rail, style }
  const { rail: _r, ...otherParts } = parts
  const nextParts = Object.keys(nextRail).length ? { ...otherParts, rail: nextRail } : otherParts
  const { parts: _p, ...otherExt } = ext
  const nextExt = Object.keys(nextParts).length ? { ...otherExt, parts: nextParts } : otherExt
  const { ext: _e, ...rest } = params
  return Object.keys(nextExt).length ? { ...rest, ext: nextExt } : rest
}
