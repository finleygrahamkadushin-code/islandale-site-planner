import type { PlanObject } from '../../store/types'

/**
 * The old library's shed and shop (legacy LIB): what one placed from it
 * carries, used for any field the object does not have. The shed mesh and
 * the site rules (height, outline) both read a shed through this, so a shed
 * from an old scheme that stored only its size is drawn and measured alike.
 */
const LIBRARY: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  shed: { w: 10, d: 12, h: 7, color: '#7d8a6a', roof: 'gable', pitch: 6, ridge: 'z', overhang: 1 },
  shop: { w: 24, d: 24, h: 12, color: '#6f7f94', roof: 'gable', pitch: 4, ridge: 'x', overhang: 1 },
}

/** A shed or shop with the library's fields filled in where it lacks them; anything else unchanged. */
export function withShedDefaults(o: PlanObject): PlanObject {
  const defaults = LIBRARY[o.type]
  if (!defaults || Object.keys(defaults).every((k) => k in o.params)) return o
  return { ...o, params: { ...defaults, ...o.params } }
}
