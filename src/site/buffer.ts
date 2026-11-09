import { isoSegments, type IsoSegment } from './contours'
import { pointFacts } from './rules/tints'
import type { Parcel } from './types'
import { ftToM } from './units'

const GRID_M = 0.5

interface ShoreGrid {
  readonly nx: number
  readonly ny: number
  readonly x0: number
  readonly n0: number
  /** Plain distances to the banked east shore and the south-west shore, metres; NaN outside the lot. */
  readonly dBank: Float64Array
  readonly dShore: Float64Array
}

// the distances don't depend on the settings, so a slider only re-runs the cheap iso-line pass
const grids = new WeakMap<Parcel, ShoreGrid>()

function shoreGrid(parcel: Parcel): ShoreGrid {
  const hit = grids.get(parcel)
  if (hit) return hit
  const xs = parcel.ring.map((p) => p[0])
  const ns = parcel.ring.map((p) => p[1])
  const x0 = Math.min(...xs) - GRID_M
  const n0 = Math.min(...ns) - GRID_M
  const nx = Math.ceil((Math.max(...xs) - x0) / GRID_M) + 2
  const ny = Math.ceil((Math.max(...ns) - n0) / GRID_M) + 2
  const dBank = new Float64Array(nx * ny)
  const dShore = new Float64Array(nx * ny)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const f = pointFacts(parcel, x0 + i * GRID_M, n0 + j * GRID_M)
      dBank[j * nx + i] = f.inLot ? f.dBank : NaN
      dShore[j * nx + i] = f.inLot ? f.dShore : NaN
    }
  }
  const grid = { nx, ny, x0, n0, dBank, dShore }
  grids.set(parcel, grid)
  return grid
}

/**
 * The shoreline buffer line inside the lot (5E): `shoreFt` back from the top
 * of bank on the banked east shore (so shoreFt + bankFt from the water) and
 * `shoreFt` from the water on the south-west shore. The iso-line of
 * distance past the bank over a fine grid, kept to the lot.
 */
export function shoreBufferLine(parcel: Parcel, shoreFt: number, bankFt: number): IsoSegment[] {
  const g = shoreGrid(parcel)
  const bankM = ftToM(bankFt)
  const at = (i: number, j: number) => {
    const k = j * g.nx + i
    return Math.min(g.dBank[k] - bankM, g.dShore[k])
  }
  return isoSegments({ nx: g.nx, ny: g.ny, x0: g.x0, n0: g.n0, spacing: GRID_M, at }, ftToM(shoreFt))
}

/**
 * The top of bank on the east shore (5E): the line `bankFt` in from the
 * banked shore's OHWM, kept to the lot and to ground nearer the banked
 * shore than the south-west one (where the bank gives way to the beach).
 * The shoreline setback on the east shore is measured from this line.
 */
export function topOfBankLine(parcel: Parcel, bankFt: number): IsoSegment[] {
  const g = shoreGrid(parcel)
  const at = (i: number, j: number) => {
    const k = j * g.nx + i
    return g.dBank[k] <= g.dShore[k] ? g.dBank[k] : NaN
  }
  return isoSegments({ nx: g.nx, ny: g.ny, x0: g.x0, n0: g.n0, spacing: GRID_M, at }, ftToM(bankFt))
}
