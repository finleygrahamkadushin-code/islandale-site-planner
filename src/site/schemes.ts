import schemesJson from '../../data/islandale/schemes.json'

/** One object of a legacy scheme, kept as the legacy planner wrote it. */
export interface LegacySchemeObject {
  readonly t: string
  readonly name: string
  readonly x?: number
  readonly n?: number
  readonly rot?: number
  readonly [key: string]: unknown
}

export interface Scheme {
  readonly id: string
  readonly name: string
  readonly tag: string
  readonly blurb: string
  readonly rulesOff: boolean
  readonly objects: readonly LegacySchemeObject[]
}

export const CURRENT_SCHEME_ID = 'C'
/** Variants of the current scheme, offered as options under it. */
export const CURRENT_VARIANT_IDS = ['C2', 'C3', 'C4'] as const

export function loadSchemes(): readonly Scheme[] {
  return schemesJson.schemes.map((s) => ({
    id: s.id,
    name: s.name,
    tag: s.tag ?? '',
    blurb: s.blurb ?? '',
    rulesOff: Boolean((s as { rulesOff?: boolean }).rulesOff),
    objects: s.objects as LegacySchemeObject[],
  }))
}

export function schemeById(schemes: readonly Scheme[], id: string): Scheme {
  const s = schemes.find((x) => x.id === id)
  if (!s) throw new Error(`unknown scheme "${id}"`)
  return s
}

/** Everything that is neither the current scheme nor one of its variants. */
export const ARCHIVED_SCHEME_IDS: readonly string[] = loadSchemes()
  .map((s) => s.id)
  .filter((id) => id !== CURRENT_SCHEME_ID && !(CURRENT_VARIANT_IDS as readonly string[]).includes(id))
