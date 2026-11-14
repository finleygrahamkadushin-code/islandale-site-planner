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

/**
 * The current scheme. This copy of the planner holds Scheme C
 * ("C · Prow & Lantern") only; the full set of 12 is on `main`.
 */
export const CURRENT_SCHEME_ID = 'C'

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

const SCHEME_IDS: readonly string[] = loadSchemes().map((s) => s.id)

/** Variants of the current scheme (its id and a number) the data holds, offered as options under it. */
export const CURRENT_VARIANT_IDS: readonly string[] = SCHEME_IDS.filter((id) => new RegExp(`^${CURRENT_SCHEME_ID}\\d+$`).test(id))

/** Everything the data holds that is neither the current scheme nor one of its variants. */
export const ARCHIVED_SCHEME_IDS: readonly string[] = SCHEME_IDS.filter((id) => id !== CURRENT_SCHEME_ID && !CURRENT_VARIANT_IDS.includes(id))

/**
 * Whether there is a scheme to choose: with one scheme in the data the top
 * bar's Scheme list, File → Designs and the "Browse designs" command are hidden.
 */
export function hasSchemeChoice(schemes: readonly Scheme[]): boolean {
  return schemes.length > 1
}
