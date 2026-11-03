import { shapeParamKey } from './organic'

/**
 * The Shape and roof fields of the old planner's shape editor (sh-shape,
 * sh-taper, sh-roof, sh-ridge, sh-oh, sh-pitch, sh-rmat, sh-curl) and pad
 * shape editor (pd-shape, pd-taper, pd-cars), as option lists and patch
 * helpers. Pure; the store applies a patch as one undo step.
 */

type Params = Readonly<Record<string, unknown>>

export interface Option {
  readonly value: string
  readonly label: string
}

/** Footprints a building or wing can take (legacy sh-shape). */
export const BUILDING_SHAPES: readonly Option[] = [
  { value: 'rect', label: 'Rectangle' },
  { value: 'hex', label: 'Hexagon' },
  { value: 'oct', label: 'Octagon' },
  { value: 'tri', label: 'Triangle' },
  { value: 'trap', label: 'Trapezoid' },
  { value: 'para', label: 'Skewed' },
  { value: 'half', label: 'Bay (half-hex)' },
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'kidney', label: 'Kidney (bean)' },
  { value: 'teardrop', label: 'Teardrop' },
  { value: 'blob', label: 'Blob (free form)' },
  { value: 'poly', label: 'Outline (sharp + curved)' },
]

/** Footprints a pad, deck, meadow or pond can take (legacy pd-shape). */
export const PAD_SHAPES: readonly Option[] = [
  { value: 'rect', label: 'Rectangle' },
  { value: 'trap', label: 'Trapezoid (flared)' },
  { value: 'para', label: 'Skewed' },
  { value: 'hex', label: 'Hexagon' },
  { value: 'oct', label: 'Octagon' },
  { value: 'half', label: 'Bay' },
  { value: 'tri', label: 'Triangle' },
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'kidney', label: 'Kidney (bean)' },
  { value: 'teardrop', label: 'Teardrop' },
  { value: 'blob', label: 'Blob (free form)' },
  { value: 'ribbon', label: 'Ribbon path' },
]

/** Roof types (legacy ROOFS). */
export const ROOF_OPTIONS: readonly string[] = ['gable', 'hip', 'shed', 'flat', 'gambrel', 'butterfly', 'pyramid', 'dome', 'vault', 'shell', 'saddle', 'sod', 'prow', 'none']

/** Roof finishes; '' is the standard finish (legacy ROOF_MATS). */
export const ROOF_FINISHES: readonly Option[] = [
  { value: '', label: 'Standard' },
  { value: 'glass', label: 'Glass' },
  { value: 'copper', label: 'Copper' },
  { value: 'metal', label: 'Metal' },
  { value: 'sod', label: 'Sod' },
]

/** Object types the pad shape editor serves (legacy refreshShape isPad). */
export const PAD_TYPES: ReadonlySet<string> = new Set(['pad', 'deck', 'garden', 'septic', 'meadow', 'pond'])

export interface ExtraField {
  readonly key: 'taper' | 'skew' | 'bend' | 'point'
  readonly label: string
  readonly unit: string
  readonly min: number
  readonly max: number
  readonly step: number
  /** What the field shows when the shape has no value stored. */
  readonly fallback: (w: number) => number
}

const EXTRA: Readonly<Record<string, ExtraField>> = {
  trap: { key: 'taper', label: 'Taper', unit: 'back/front', min: 0.15, max: 1, step: 0.05, fallback: () => 0.6 },
  para: { key: 'skew', label: 'Skew', unit: 'ft', min: -1000, max: 1000, step: 0.5, fallback: (w) => Math.round(w * 0.3 * 10) / 10 },
  kidney: { key: 'bend', label: 'Bend', unit: '0–1', min: 0, max: 1, step: 0.05, fallback: () => 0.35 },
  teardrop: { key: 'point', label: 'Point', unit: '0–1', min: 0, max: 1, step: 0.05, fallback: () => 0.5 },
}

/** The one extra field the old planner shows for a shape (taper, skew, bend or point), or null. */
export function extraField(shape: string): ExtraField | null {
  return EXTRA[shape] ?? null
}

/** A typed value for the shape's extra field (legacy sh-taper change): skew takes any number, the rest a fraction up to 1, cleared by 0 or less. */
export function extraPatch(shape: string, v: number | null): Params {
  const key = shapeParamKey(shape)
  if (key === 'skew') return { skew: v !== null && Number.isFinite(v) ? v : undefined }
  return { [key]: v !== null && Number.isFinite(v) && v > 0 ? Math.min(1, v) : undefined }
}

/** A new footprint shape, kept to the list (legacy shapeField sh-shape / pd-shape). */
export function shapePatch(shape: string, pad: boolean): Params {
  const list = pad ? PAD_SHAPES : BUILDING_SHAPES
  return { shape: list.some((o) => o.value === shape) ? shape : 'rect' }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** One roof field as the old planner clamps it. */
export function roofPatch(key: 'roof' | 'ridge' | 'overhang' | 'pitch' | 'roofMat' | 'curl', raw: string): Params {
  if (key === 'roof') return { roof: ROOF_OPTIONS.includes(raw) ? raw : 'gable' }
  if (key === 'ridge') return { ridge: raw === 'z' ? 'z' : 'x' }
  if (key === 'overhang') return { overhang: clamp(Number(raw) || 0, 0, 6) }
  if (key === 'pitch') return { pitch: clamp(Number(raw) || 6, 1, 18) }
  if (key === 'roofMat') return { roofMat: ROOF_FINISHES.some((o) => o.value === raw && raw) ? raw : undefined }
  return { curl: raw === '' ? undefined : clamp(Number(raw) || 0, 0, 1) }
}

/** Cars drawn on a parking pad, 0–8 (legacy pd-cars). */
export const carsPatch = (v: number): Params => ({ cars: clamp(Math.round(v) || 0, 0, 8) })

/** Whether a params object would change under a patch (so a no-op is not an undo step). */
export function changes(p: Params, patch: Params): boolean {
  return Object.entries(patch).some(([k, v]) => p[k] !== v)
}
