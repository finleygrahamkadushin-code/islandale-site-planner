import { num } from '../footprint'
import { edgeName, partName, type Mass, type MassKind } from '../masses'
import { isRectPart } from './partHandles'
import type { RailState } from '../rails/railEdits'
import type { EdgeRail } from '../rails/railRules'
import type { StairInfo } from '../stairs/stairPlan'

/**
 * The words the part HUD, the part inspector, the Railings panel and the
 * rail chips use, and the side effects of changing a wing's kind (legacy
 * Wings panel, hudText, rail-edit). Pure.
 */

type Params = Record<string, unknown>
const IN = 0.0254
const f1 = (v: number) => String(+v.toFixed(1))
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const isAccessKind = (k: MassKind) => k === 'stair' || k === 'ramp'

/** "Editing: Deck 3 · 12 × 10 ft · drag an edge handle to resize, Delete to remove" (legacy hudText). */
export function hudText(m: Mass, mi: number): string {
  const rect = isRectPart(m)
  const tail =
    mi === 0
      ? rect
        ? 'drag an edge handle to resize, Esc for the whole building'
        : 'Esc for the whole building'
      : rect
        ? 'drag an edge handle to resize, Delete to remove'
        : 'drag the grip to move, Delete to remove'
  return `Editing: ${partName(m, mi)} · ${f1(m.w)} × ${f1(m.d)} ft · ${tail}`
}

/** The smallest width or depth the part fields take, feet: 3 for stairs and ramps, 4 otherwise (legacy Wings panel). */
export const minSizeFt = (kind: MassKind): number => (isAccessKind(kind) ? 3 : 4)
/** A wing's level above the building floor stays within this, feet (legacy wingLevel). */
export const MAX_LEVEL_FT = 30

/**
 * The fields that change with a wing's kind (legacy Wings panel): open
 * unless walls; stairs and ramps lose their roof and walls and are 3 to 8 ft
 * wide; a deck is 1 ft with no roof; other kinds take the cabin's wall
 * height if they had none; sizes at least the kind's minimum.
 */
export function kindPatch(wing: Params, kind: MassKind, mainH: number): Params {
  const w = num(wing.w, 10)
  const d = num(wing.d, 10)
  const min = minSizeFt(kind)
  const access = isAccessKind(kind)
  const extra: Params = access ? { roof: 'none', h: 0 } : kind === 'deck' ? { roof: 'none', h: 1 } : num(wing.h, 0) < 1 ? { h: mainH } : {}
  return { kind, open: kind !== 'wall', ...extra, w: Math.max(min, access ? clamp(w, 3, 8) : w), d: Math.max(min, d) }
}

/** "on", "off — required, 4.2 ft up", "auto (required)", "not needed" (legacy rail-edit desc), auto saying what is drawn. */
export function railDesc(e: Pick<EdgeRail, 'state' | 'required' | 'drawn' | 'dropFt'>): string {
  if (e.state === 'on') return e.required ? 'on (required)' : 'on'
  if (e.state === 'off') return e.required ? `off — required, ${e.dropFt.toFixed(1)} ft up` : 'off'
  if (e.required) return 'auto (required)'
  return e.drawn ? 'auto (railed)' : 'not needed'
}

/** One Railings row: "front 12 ft · not needed · opening at Stair 2", or "back · against the house". */
export function railRowText(m: Pick<Mass, 'shape'>, e: EdgeRail): string {
  const name = edgeName(m, e.i)
  if (!e.free) return `${name} · against the house`
  const openings = e.names.length ? ` · opening at ${e.names.join(', ')}` : ''
  return `${name} ${Math.round(e.lenFt)} ft · ${railDesc(e)}${openings}`
}

const CHIP_LABELS: Record<RailState, string> = { on: 'rail ✓', off: 'rail –', auto: 'rail auto' }
export const railChipLabel = (s: RailState): string => CHIP_LABELS[s]

/** "front edge · auto · guard required (3.4 ft up) — click: auto → on → off" (legacy rail chip title). */
export function railChipTitle(m: Pick<Mass, 'shape'>, e: EdgeRail): string {
  const req = e.required ? ` · guard required (${e.dropFt.toFixed(1)} ft up)` : ''
  return `${edgeName(m, e.i)} edge · ${e.state}${req} — click: auto → on → off`
}

/** "deck 3" or "porch 1", the Railings panel's word for a wing. */
export const railTarget = (m: Pick<Mass, 'kind'>, mi: number): string => `${m.kind === 'porch' || m.kind === 'wall' ? 'porch' : m.kind} ${mi}`

/** "Rails on 3 of 4 edges · 1 required edge off", for the part inspector. */
export function railSummary(edges: readonly EdgeRail[]): string {
  const drawn = edges.filter((e) => e.drawn).length
  const missing = edges.filter((e) => e.required && !e.drawn).length
  const warn = missing ? ` · ${missing} required edge${missing > 1 ? 's' : ''} off` : ''
  return `Rails on ${drawn} of ${edges.length} edge${edges.length === 1 ? '' : 's'}${warn}`
}

/** Said where the planner draws structure (R3.8): posts every 2.4 m and 4 × 25 cm stringers at any height are a picture, not a design. */
export const SUPPORTS_NOTE = 'Posts and stringers are drawn to show the idea, not sized: an engineer sizes them'

/** Lines for a stair's or ramp's numbers, and a warning when they break the planner's rule (see codeCheckStairs). */
export function stairSummary(info: StairInfo, attached = true): { readonly lines: readonly string[]; readonly warn: string | null } {
  const inches = (m: number) => `${f1(m / IN)} in`
  const site = [info.footAbove ? 'The ground at the foot is above the floor: the stair runs into it' : null, attached ? null : 'Its top meets no porch, deck or walls']
  const join = (...w: (string | null)[]) => w.filter(Boolean).join('. ') || null
  const flight = (limit: string) => (info.flightOver ? `Rises over ${limit} with no landing: use Connect to route it with landings` : null)
  if (info.kind === 'ramp') {
    const slope = info.slope > 0 ? `1:${f1(1 / info.slope)}` : 'level'
    const rail = info.handrailMissing ? 'A ramp rising over 6 in needs handrails' : null
    return { lines: [`Slope ${slope}`, `Drop ${inches(info.drop)}`], warn: join(info.steep ? 'Steeper than 1:12' : null, flight('30 in'), rail, ...site) }
  }
  const lines = [`${info.n} riser${info.n === 1 ? '' : 's'} of ${inches(info.rise)}`, `Treads ${inches(info.tread)}`, ...(info.posts > 0 ? [SUPPORTS_NOTE] : [])]
  const rail = info.handrailMissing ? 'Four or more risers need a handrail' : null
  return { lines, warn: join(info.ok ? null : 'Risers over 7 in or treads under 11 in', flight('12 ft'), rail, ...site) }
}
