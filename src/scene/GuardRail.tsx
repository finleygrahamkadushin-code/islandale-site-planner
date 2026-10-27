import { useEffect, useMemo } from 'react'
import type { LocalPoint } from '../buildings/footprint'
import type { Mass } from '../buildings/masses'
import { buildRail, railRuns } from '../buildings/rails'
import type { BuildingLook, MassSite } from './buildingLook'
import { toGeometry } from './meshData'
import { Surface } from './Surface'

/** A rail piece is left out when another mass is this close to it, feet. */
const CLEARANCE_FT = 1.5
const PROBES = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((a) => [Math.cos(a) * CLEARANCE_FT, Math.sin(a) * CLEARANCE_FT] as const)

/** A guard round the open edges of a deck or porch floor, wherever it stands more than 30 in above the ground. */
export function GuardRail({ m, poly, site, look }: { readonly m: Mass; readonly poly: readonly LocalPoint[]; readonly site: MassSite; readonly look: BuildingLook }) {
  const rail = useMemo(() => {
    if (m.rail === false) return null
    const runs = railRuns(poly, {
      dropAt: ([x, z]) => (m.rail === true ? Infinity : site.floor - site.groundAt(x, z)),
      skipEdge: (i) => !!m.steps && i >= m.steps.e0 && i <= m.steps.e1,
      blocked: ([x, z]) => site.insideOther([x, z]) || PROBES.some(([dx, dz]) => site.insideOther([x + dx, z + dz])),
    })
    return runs.length ? toGeometry(buildRail(runs)) : null
  }, [m, poly, site.floor]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => rail?.dispose(), [rail])
  if (!rail) return null
  return (
    <mesh geometry={rail} castShadow>
      <Surface kind="wood" style={look.style} color="#6e5a44" />
    </mesh>
  )
}
