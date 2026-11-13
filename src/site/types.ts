/** Local site frame: metres, x east, n north, origin at the terrain grid centre. */
export type SitePoint = readonly [x: number, n: number]

export interface Terrain {
  /** Longitude / latitude of grid sample (0, 0). */
  readonly lon0: number
  readonly lat0: number
  /** Sample spacing in metres. */
  readonly spacing: number
  readonly nx: number
  readonly ny: number
  /** Local x of column 0 and local n of row 0, metres. */
  readonly x0: number
  readonly n0: number
  /** Elevations in metres NAVD88, row-major: index = row * nx + col. */
  readonly z: readonly number[]
}

export interface Parcel {
  /** Closed ring (last vertex is not repeated), metres in the site frame. */
  readonly ring: readonly SitePoint[]
  /** Assessor lot area, square feet. */
  readonly lotSqFt: number
  /**
   * Ring edges [i, i+1] with first <= i <= last run along the water. They are
   * the assessor's lot line at the water (San Juan County, via the WDFW parcel
   * service; `meta.source` in parcel.json), not a surveyed ordinary high water
   * mark: along most of the shore they lie below 8 ft NAVD88 (decision 1, Nov 13).
   */
  readonly shorelineEdges: { readonly first: number; readonly last: number }
}

export interface Site {
  readonly name: string
  readonly terrain: Terrain
  readonly parcel: Parcel
}
