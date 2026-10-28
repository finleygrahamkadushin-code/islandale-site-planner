/** A legacy cut: `x` is feet from the wall's left end as seen from outside. */
export interface LegacyCut {
  readonly edge?: number
  readonly along?: boolean
  readonly kind?: string
  readonly x?: number
  readonly w?: number
  readonly h?: number
  readonly sill?: number
}
