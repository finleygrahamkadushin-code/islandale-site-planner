import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Color, ConeGeometry, Euler, IcosahedronGeometry, Matrix4, Quaternion, Vector3, type BufferGeometry, type InstancedMesh } from 'three'
import { footprintParams, localFootprint, localToSite, type LocalPoint } from '../../buildings/footprint'
import { buildDrapedPad } from './drape'
import { FLOWER_HEAD_M, TUFT_CONE, meadowMarks, objectSeed, type MeadowMark } from './siteObjects'
import { usePlanStore } from '../../store/planStore'
import type { DisplayStyle, PlanObject } from '../../store/types'
import { toScene } from '../../scene/frame'
import { toGeometry } from '../../scene/meshData'
import { baseElevation } from '../../scene/placement'
import { Surface } from '../../scene/Surface'
import { useDisplayStyle } from '../../scene/useDisplayStyle'
import { useEarthworks } from '../earthworks/useEarthworks'
import { useObjectInteraction } from '../../scene/useObjectInteraction'
import { M_PER_FT as FT } from '../units'

/** The meadow's ground is draped in cells this wide, feet (legacy drapeGeom, 0.6 m). */
const MEADOW_CELL_FT = 2
/** Its top lies this far over the ground, metres (with the drape's own 1 cm, the legacy 5 cm). */
const MEADOW_TOP_M = 0.04
const MEADOW_COLOUR = '#a7bf73'

// shared by every meadow, never disposed
const TUFT: BufferGeometry = new ConeGeometry(TUFT_CONE.radius, TUFT_CONE.height, TUFT_CONE.sides)
const FLOWER: BufferGeometry = new IcosahedronGeometry(FLOWER_HEAD_M, 0)

/**
 * A meadow (legacy earthObjMesh): grass draped over the ground inside its
 * outline, with seeded grass tufts and flowers scattered over it.
 */
export function MeadowMesh({ o }: { readonly o: PlanObject }) {
  const terrain = usePlanStore((s) => s.site.terrain)
  const { ground, drawnGround } = useEarthworks()
  const { selected, hovered, handlers } = useObjectInteraction(o)
  const style = useDisplayStyle()
  // the outline and the scatter change with the meadow's shape, not while it is dragged
  const outline = useMemo(() => localFootprint(footprintParams(o)), [o.params]) // eslint-disable-line react-hooks/exhaustive-deps
  const seed = objectSeed(o.params, o.id)
  const flowers = o.params.flowers
  const marks = useMemo(() => meadowMarks(outline, seed, flowers), [outline, seed, flowers])
  const base = baseElevation(terrain, o, ground)
  const { x, n } = o.position
  const rot = o.rotation
  // ground under a local point (feet), metres above the meadow's base, as the terrain mesh draws it
  const groundFt = useMemo(() => {
    const at = { x, n }
    return (p: LocalPoint) => drawnGround(...localToSite(at, rot, p)) - base
  }, [x, n, rot, base, drawnGround])
  const groundM = useMemo(() => (mx: number, mz: number) => groundFt([mx / FT, mz / FT]), [groundFt])
  const surface = useMemo(() => toGeometry(buildDrapedPad(outline, groundFt, MEADOW_TOP_M, MEADOW_CELL_FT)), [outline, groundFt])
  useEffect(() => () => surface.dispose(), [surface])
  const color = typeof o.params.color === 'string' ? o.params.color : MEADOW_COLOUR
  const glow = selected ? 1 : hovered ? 0.4 : 0
  return (
    <group position={toScene(x, n, base)} rotation={[0, (rot * Math.PI) / 180, 0]} userData={{ objectId: o.id }}>
      <mesh geometry={surface} receiveShadow {...handlers}>
        <Surface kind="canopy" style={style} color={color} texture="sod" textureUnit="m" glow={glow} />
      </mesh>
      <Marks marks={marks.tufts} geometry={TUFT} groundAt={groundM} style={style} glow={glow} />
      <Marks marks={marks.flowers} geometry={FLOWER} groundAt={groundM} style={style} glow={glow} />
    </group>
  )
}

interface MarksProps {
  readonly marks: readonly MeadowMark[]
  readonly geometry: BufferGeometry
  /** Ground under a local point (metres), metres above the base. */
  readonly groundAt: (x: number, z: number) => number
  readonly style: DisplayStyle
  readonly glow: number
}

/**
 * One instanced mesh of tufts or flowers (legacy instanced()), each set on
 * the ground under it. Their own colours in the Realistic style; elsewhere
 * they take the style's flat tone. Not pickable: a click goes through to
 * the meadow under them.
 */
function Marks({ marks, geometry, groundAt, style, glow }: MarksProps) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const im = ref.current
    if (!im) return
    const m = new Matrix4()
    const q = new Quaternion()
    const e = new Euler()
    const p = new Vector3()
    const s = new Vector3()
    const c = new Color()
    marks.forEach((k, i) => {
      q.setFromEuler(e.set(k.turn[0], k.turn[1], k.turn[2]))
      p.set(k.x, groundAt(k.x, k.z) + k.lift, k.z)
      s.set(k.scale[0], k.scale[1], k.scale[2])
      im.setMatrixAt(i, m.compose(p, q, s))
      im.setColorAt(i, style === 'realistic' ? c.set(k.color) : c.set('#ffffff'))
    })
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
    im.computeBoundingSphere()
  }, [marks, groundAt, style])
  if (marks.length === 0) return null
  return (
    <instancedMesh key={marks.length} ref={ref} args={[geometry, undefined, marks.length]} receiveShadow>
      <Surface kind="canopy" style={style} color="#ffffff" glow={glow} />
    </instancedMesh>
  )
}
