import { useEffect, useMemo } from 'react'
import { BufferGeometry, Color, ConeGeometry, DoubleSide, Euler, Float32BufferAttribute, Matrix4, Quaternion, ShapeUtils, Vector2, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { footprintParams, localFootprint, localToSite, num, siteFootprint } from '../../buildings/footprint'
import { pondLevel, type PondWater } from '../earthworks/earthworks'
import type { DisplayStyle, PlanObject } from '../../store/types'
import { toScene } from '../../scene/frame'
import { Surface } from '../../scene/Surface'
import { seededRandom, treeSeed } from './treeShapes'
import { useDisplayStyle } from '../../scene/useDisplayStyle'
import { useEarthworks } from '../earthworks/useEarthworks'
import { useObjectInteraction } from '../../scene/useObjectInteraction'
import { M_PER_FT as FT } from '../units'

/** Legacy pond water: its colour (default #4f7f8c) darkened to 0.8, at 0.86 opacity. */
const WATER = '#4f7f8c'
const WATER_SHADE = 0.8
const WATER_OPACITY = 0.86
/** Reeds per metre of rim (legacy o.reeds ?? 2.2), a third of them skipped, in the legacy reed greens. */
const REEDS_PER_M = 2.2
const REED_SKIP = 0.35
const REED_COLOURS = ['#7d8f4a', '#a39a5a', '#6c8445', '#94904f'] as const
const REED = { radius: 0.06, height: 0.9, sides: 4 } as const

type Local = readonly [number, number]

/**
 * A pond or rain garden (legacy earthObjMesh pond): flat water at the level
 * its bowl was dug for, the lowest rim point less 0.06 m, with seeded reeds
 * round the rim. The bowl itself is in the ground (site/earthworks).
 */
export function PondMesh({ o }: { readonly o: PlanObject }) {
  const style = useDisplayStyle()
  const { works, ground } = useEarthworks()
  const { selected, hovered, handlers } = useObjectInteraction(o)
  // while the pond is dragged the bowl stays where it was dug; the water follows the pointer on the ground
  const dug = works.ponds.get(o.id)
  const level = dug && sameOutline(dug, o) ? dug.level : pondLevel(o, ground)
  const outline = useMemo(() => localFootprint(footprintParams(o)).map(([x, z]): Local => [x * FT, z * FT]), [o.params]) // eslint-disable-line react-hooks/exhaustive-deps
  const water = useMemo(() => waterGeometry(outline), [outline])
  const { x, n } = o.position
  const rot = o.rotation
  const seed = typeof o.params.seed === 'number' ? o.params.seed || 1 : treeSeed(o.id)
  const density = num(o.params.reeds, REEDS_PER_M)
  const reeds = useMemo(() => {
    const at = { x, n }
    const above = (lx: number, lz: number) => Math.max(0, ground(...localToSite(at, rot, [lx / FT, lz / FT])) - level)
    return reedGeometry(outline, seed, density, above)
  }, [outline, seed, density, ground, x, n, rot, level])
  useEffect(() => () => water.dispose(), [water])
  useEffect(() => () => reeds?.dispose(), [reeds])
  const tint = typeof o.params.color === 'string' ? o.params.color : WATER
  const glow = selected ? 1 : hovered ? 0.4 : 0
  return (
    <group position={toScene(x, n, level)} rotation={[0, (rot * Math.PI) / 180, 0]} userData={{ objectId: o.id }}>
      <mesh geometry={water} receiveShadow renderOrder={2} {...handlers}>
        <WaterMaterial style={style} colour={tint} glow={glow} />
      </mesh>
      {reeds && (
        <mesh geometry={reeds} castShadow receiveShadow>
          <Surface kind="canopy" style={style} glow={glow} vertexColors />
        </mesh>
      )}
    </group>
  )
}

function WaterMaterial({ style, colour, glow }: { readonly style: DisplayStyle; readonly colour: string; readonly glow: number }) {
  const shaded = useMemo(() => new Color(colour).multiplyScalar(WATER_SHADE), [colour])
  const see = { transparent: true, side: DoubleSide, depthWrite: false, emissive: glow > 0 ? '#ffffff' : '#000000', emissiveIntensity: glow * 0.22 } as const
  if (style === 'realistic') return <meshPhysicalMaterial {...see} color={shaded} opacity={WATER_OPACITY} roughness={0.06} metalness={0} clearcoat={1} clearcoatRoughness={0.05} envMapIntensity={1.4} />
  return <meshStandardMaterial {...see} color={style === 'diagram' ? '#9fb6c2' : '#c9d2d6'} opacity={0.8} roughness={0.4} />
}

/** Whether the bowl in the ground was dug for the pond where it is now. */
function sameOutline(dug: PondWater, o: PlanObject): boolean {
  const now = siteFootprint(o)
  return now.length === dug.poly.length && now.every((p, i) => Math.abs(p[0] - dug.poly[i][0]) < 1e-6 && Math.abs(p[1] - dug.poly[i][1]) < 1e-6)
}

/** The water surface: the outline (local metres, +z front) triangulated flat at y 0, facing up. */
export function waterGeometry(outline: readonly Local[]): BufferGeometry {
  const faces = ShapeUtils.triangulateShape(outline.map(([x, z]) => new Vector2(x, z)), [])
  const positions = outline.flatMap(([x, z]) => [x, 0, z])
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(positions, 3))
  g.setAttribute('normal', new Float32BufferAttribute(outline.flatMap(() => [0, 1, 0]), 3))
  g.setAttribute('uv', new Float32BufferAttribute(outline.flatMap(([x, z]) => [x, z]), 2))
  g.setIndex(faces.flat())
  g.computeBoundingSphere()
  return g
}

/**
 * Reeds round the rim (legacy pond reeds): per edge, `density` a metre, a
 * third skipped, each a slim cone leaning a little, mostly just outside
 * the water, standing on the ground or the water whichever is higher.
 * `above` is the ground over the water level at a local point, metres.
 */
export function reedGeometry(outline: readonly Local[], seed: number, density: number, above: (x: number, z: number) => number): BufferGeometry | null {
  const rnd = seededRandom(seed * 313 + 5)
  const cone = new ConeGeometry(REED.radius, REED.height, REED.sides)
  const parts: BufferGeometry[] = []
  const m = new Matrix4()
  const q = new Quaternion()
  const e = new Euler()
  const c = new Color()
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (!len) return
    const k = Math.round(len * density)
    for (let s = 0; s < k; s++) {
      if (rnd() < REED_SKIP) continue
      const t = rnd()
      const off = (rnd() - 0.35) * 0.6
      const x = a[0] + (b[0] - a[0]) * t + ((b[1] - a[1]) / len) * off
      const z = a[1] + (b[1] - a[1]) * t - ((b[0] - a[0]) / len) * off
      const size = 0.6 + rnd() * 0.9
      const turn = rnd() * 6
      const tx = (rnd() - 0.5) * 0.3
      const tz = (rnd() - 0.5) * 0.3
      c.set(REED_COLOURS[Math.floor(rnd() * REED_COLOURS.length)])
      const reed = cone.clone().applyMatrix4(m.compose(new Vector3(x, above(x, z) + 0.35 * size, z), q.setFromEuler(e.set(tx, turn, tz)), new Vector3(size * 0.7, size, size * 0.7)))
      const count = reed.getAttribute('position').count
      reed.setAttribute('color', new Float32BufferAttribute(Array.from({ length: count }, () => [c.r, c.g, c.b]).flat(), 3))
      parts.push(reed)
    }
  })
  cone.dispose()
  if (!parts.length) return null
  const merged = mergeGeometries(parts)
  parts.forEach((p) => p.dispose())
  return merged
}
