import { elevationAt } from '../site/terrain'
import type { Site } from '../site/types'
import type { Environment } from '../store/types'

export type ViewId = 'overview' | 'water' | 'entry' | 'sunset' | 'top'

export const SAVED_VIEWS: readonly { readonly id: ViewId; readonly label: string; readonly hint: string }[] = [
  { id: 'overview', label: 'Overview', hint: 'The whole lot from above the south-east corner' },
  { id: 'water', label: 'From the water', hint: 'Low over Mud Bay, looking back at the lot' },
  { id: 'entry', label: 'Entry at the west notch', hint: 'Standing at the driveway, eye level' },
  { id: 'sunset', label: 'Deck at sunset', hint: 'The gathering cabin from the seaward lawn, 5:45 pm in September' },
  { id: 'top', label: 'Plan (top)', hint: 'Straight down, north up' },
]

export interface CameraPose {
  /** Scene coordinates (x east, y up, z south). */
  readonly position: readonly [number, number, number]
  readonly target: readonly [number, number, number]
  /** Environment changes that come with the view, if any. */
  readonly environment?: Partial<Environment>
}

const EYE_M = 1.7
const S = (x: number, n: number, z: number): [number, number, number] => [x, z, -n]

/** Camera poses computed from the site, so they stay right if the data changes. */
export function viewPose(id: ViewId, site: Site): CameraPose {
  const t = site.terrain
  const ring = site.parcel.ring
  const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length
  const cn = ring.reduce((a, p) => a + p[1], 0) / ring.length
  const ground = (x: number, n: number) => elevationAt(t, x, n)
  // the shoreline's middle, and the direction from the lot out to the water
  const { first, last } = site.parcel.shorelineEdges
  const shore = ring.slice(first, last + 2)
  const sx = shore.reduce((a, p) => a + p[0], 0) / shore.length
  const sn = shore.reduce((a, p) => a + p[1], 0) / shore.length
  const dl = Math.hypot(sx - cx, sn - cn) || 1
  const ox = (sx - cx) / dl
  const on = (sn - cn) / dl
  const centre = S(cx, cn, ground(cx, cn) + 3)

  switch (id) {
    case 'overview':
      return { position: S(cx + 30, cn - 38, ground(cx, cn) + 30), target: centre }
    case 'water': {
      const wx = sx + ox * 48
      const wn = sn + on * 48
      return { position: S(wx, wn, 4.5), target: S(cx - ox * 6, cn - on * 6, ground(cx, cn) + 4) }
    }
    case 'entry': {
      // the driveway at the west notch, looking east up the lane
      const ex = -30
      const en = 7
      return { position: S(ex, en, ground(ex, en) + EYE_M), target: S(-6, 4, ground(-6, 4) + 3) }
    }
    case 'sunset': {
      // out on the seaward lawn, looking back at the gathering cabin in low west light
      const gx = -1.5
      const gn = 0.5
      const ex = gx + ox * 20 - 8
      const en = gn + on * 20
      return {
        position: S(ex, en, ground(ex, en) + 2.4),
        target: S(gx, gn, ground(gx, gn) + 3.2),
        environment: { season: 'sep', hour: 17.75 },
      }
    }
    case 'top':
      return { position: S(cx, cn - 0.01, ground(cx, cn) + 140), target: S(cx, cn, ground(cx, cn)) }
  }
}
