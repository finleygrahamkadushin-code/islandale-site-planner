import { CURVED_SHAPES, localToSite } from '../../buildings/footprint'
import { buildingMasses, massBuildingPoly, type Mass } from '../../buildings/masses'
import { extResolve } from '../../buildings/paint/exterior'
import { sunPosition } from '../../site/environment/sun'
import type { Site, SitePoint } from '../../site/types'
import { ftToM } from '../../site/units'
import type { Environment, Plan, PlanObject } from '../../store/types'

/**
 * The manifest written beside the .glb (`<slug>.manifest.json`), in the
 * old exporter's format (`islandale-export/1`), so tools/blender reads it
 * unchanged. What Blender relies on: `exag`, `site.tide_ft`, and per object
 * `node, oid, x, n, floor, rot` and each building mass's world `outline`,
 * `wallEi`, `base_z` and `height_m` (check_export.py). The rest is for
 * Unreal (6F) and for people. Pure.
 */

export const MANIFEST_FORMAT = 'islandale-export/1'
const ROUND_M = 1e4

/** Where an object's node sits in the file, as the scene drew it (collect.ts). */
export interface ObjectNode {
  readonly oid: string
  readonly node: string
  /** Site metres: east, north, and the node's elevation (NAVD88). */
  readonly x: number
  readonly n: number
  readonly floor: number
  /** Degrees counter-clockwise seen from above. */
  readonly rot: number
}

export interface MassEntry {
  readonly mi: number
  readonly kind: string
  readonly shape: string
  readonly curved: boolean
  readonly open: boolean
  readonly level_ft: number
  readonly base_m: number
  readonly base_z: number
  readonly height_m: number
  readonly w_ft: number
  readonly d_ft: number
  readonly h_ft: number
  readonly rot: number
  readonly roof: string
  /** Closed polygon, world [x, n] metres, first point not repeated. */
  readonly outline: readonly SitePoint[]
  readonly wallEi: 'edge' | 'perimeter' | 'none'
  readonly walls?: readonly { readonly ei: number; readonly kind: string; readonly color: string }[]
}

export interface ManifestObject extends ObjectNode {
  readonly name: string
  readonly t: string
  readonly grade: number
  readonly params: Readonly<Record<string, unknown>>
  readonly masses?: readonly MassEntry[]
}

export interface ManifestSource {
  /** What the plan was: the scheme title or the plan's own name. */
  readonly scene: string
  readonly from: 'app' | 'headless'
  readonly schemeId: string | null
  readonly exportedAt: string
  readonly commit?: string
  readonly dirty?: boolean
  readonly displayStyle?: string
}

export interface ManifestInput {
  readonly plan: Plan
  readonly site: Site
  readonly environment: Environment
  readonly nodes: readonly ObjectNode[]
  readonly slug: string
  readonly source: ManifestSource
  readonly stats?: Readonly<Record<string, number>>
}

const r4 = (v: number): number => Math.round(v * ROUND_M) / ROUND_M
const pt = (p: SitePoint): SitePoint => [r4(p[0]), r4(p[1])]
const isCurved = (m: Mass): boolean => (CURVED_SHAPES as readonly string[]).includes(m.shape)

export function wallEiOf(m: Mass): MassEntry['wallEi'] {
  if (m.kind !== 'wall' || m.open) return 'none'
  return isCurved(m) ? 'perimeter' : 'edge'
}

export function massEntry(o: PlanObject, m: Mass, mi: number, floor: number): MassEntry {
  const outline = massBuildingPoly(m).map((p) => pt(localToSite(o.position, o.rotation, p)))
  const wallEi = wallEiOf(m)
  const edges = wallEi === 'perimeter' ? [0] : wallEi === 'edge' ? outline.map((_, i) => i) : []
  const walls = edges.map((ei) => {
    const r = extResolve(o.params as Record<string, unknown>, mi, 'wall', wallEi === 'perimeter' ? null : ei)
    return { ei, kind: r.kind || 'painted', color: r.color }
  })
  return {
    mi,
    kind: m.kind,
    shape: m.shape,
    curved: isCurved(m),
    open: m.open,
    level_ft: m.lvl,
    base_m: r4(floor + ftToM(m.lvl)),
    base_z: r4(floor + ftToM(m.lvl)),
    height_m: r4(ftToM(m.h)),
    w_ft: m.w,
    d_ft: m.d,
    h_ft: m.h,
    rot: m.rot,
    roof: m.roof,
    outline,
    wallEi,
    ...(walls.length ? { walls } : {}),
  }
}

function objectEntry(o: PlanObject, node: ObjectNode): ManifestObject {
  const entry: ManifestObject = { ...node, name: o.name, t: o.type, grade: node.floor, params: o.params }
  if (o.type !== 'house') return entry
  return { ...entry, masses: buildingMasses(o.params as Record<string, unknown>).map((m, mi) => massEntry(o, m, mi, node.floor)) }
}

const NAMING = {
  objectNode: '<name> #<id>  (child of Objects; extras {oid, name, t, x, n, rot, floor, grade})',
  meshNode: '<name> #<id>|<part>|m<mi>|e<ei>|<k>  (m/e left out when missing; k = mesh index within the object)',
  meshExtras: 'part (interior walls: partition), partSrc (planner|inferred), oid, objName, t, k, mi, ei, wallKind, roofMat, railStyle, color (sRGB hex), interior, decor',
  wallEi: 'edge: one wall mesh per outline edge, ei = edge (corner ei -> ei+1 of the mass outline); perimeter: one curved wall mesh (ei 0) follows the whole outline',
  colors: 'glTF baseColorFactor is linear; extras keep the sRGB hex',
  uvs: 'TEXCOORD_0 in metres (Blender writes its own UVMeters map on import)',
}

export function buildManifest({ plan, site, environment, nodes, slug, source, stats }: ManifestInput) {
  const sun = sunPosition(environment.season, environment.hour)
  const objects = nodes.flatMap((node) => {
    const o = plan.objects[node.oid]
    return o ? [objectEntry(o, node)] : []
  })
  return {
    format: MANIFEST_FORMAT,
    ...source,
    exag: 1,
    files: { glb: `${slug}.glb`, manifest: `${slug}.manifest.json` },
    naming: NAMING,
    site: {
      frame: 'metres; x east, n north, origin at the terrain grid centre. glTF: Y up, -Z north. Blender: X east, Y north, Z = elevation',
      verticalDatum: 'NAVD88 (metres)',
      exag: 1,
      grid: { lon0: site.terrain.lon0, lat0: site.terrain.lat0, spacing: site.terrain.spacing, nx: site.terrain.nx, ny: site.terrain.ny, x0: site.terrain.x0, n0: site.terrain.n0 },
      tide_ft: environment.tideFt,
      water_m: r4(ftToM(environment.tideFt)),
    },
    parcel: { ring: site.parcel.ring.map(pt), shorelineEdges: site.parcel.shorelineEdges, lotSqFt: site.parcel.lotSqFt },
    sun: {
      season: environment.season,
      hour: environment.hour,
      lat: 48.46,
      elevation_deg: r4(sun.elevationDeg),
      azimuth_deg: r4(sun.azimuthDeg),
      azimuthFrom: 'north, clockwise',
      direction_xnz: sun.direction.map(r4),
    },
    objects,
    ...(stats ? { stats } : {}),
  }
}

export type Manifest = ReturnType<typeof buildManifest>
