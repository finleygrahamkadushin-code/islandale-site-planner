import { useEffect, useMemo } from 'react'
import { footprintParams, localFootprint, localToSite, num } from '../buildings/footprint'
import { buildWalls } from '../buildings/walls'
import { buildRoof } from '../buildings/roof'
import { placeOpenings, type LegacyCut, type Opening } from '../buildings/openings'
import { postPositions, supportType } from '../buildings/foundation'
import { elevationAt } from '../site/terrain'
import { ftToM } from '../site/units'
import { usePlanStore } from '../store/planStore'
import type { PlanObject } from '../store/types'
import type { DisplayStyle } from '../store/types'
import { baseElevation } from './placement'
import { toScene } from './frame'
import { toGeometry } from './meshData'
import { Surface, diagramColourFor, type TextureName } from './Surface'
import { useObjectInteraction } from './useObjectInteraction'
import { useDisplayStyle } from './useDisplayStyle'

const EMBED_M = 0.3
const RIM_M = 0.3

/** A cabin: siding walls, its roof with eaves and fascia, framed openings, and posts or a skirt down to the slope. */
export function BuildingMesh({ o }: { readonly o: PlanObject }) {
  const terrain = usePlanStore((s) => s.site.terrain)
  const style = useDisplayStyle()
  const { selected, hovered, handlers } = useObjectInteraction(o)
  const fp = footprintParams(o)
  const p = o.params
  const hFt = num(p.h, 9)
  const roofType = typeof p.roof === 'string' ? p.roof : 'gable'
  const pitch = num(p.pitch, 6)
  const ridge = p.ridge === 'z' ? 'z' : 'x'
  const overhang = num(p.overhang, 1.5)
  const cuts = Array.isArray(p.cuts) ? (p.cuts as LegacyCut[]) : []

  const poly = useMemo(() => localFootprint(fp), [fp.w, fp.d, fp.shape, fp.taper, fp.skew, fp.pts]) // eslint-disable-line react-hooks/exhaustive-deps
  const walls = useMemo(() => toGeometry(buildWalls(poly, hFt)), [poly, hFt])
  const roof = useMemo(() => {
    const r = buildRoof(poly, { type: roofType, pitch, ridge, overhangFt: overhang })
    return { roof: toGeometry(r.roof), gables: toGeometry(r.gables), trim: toGeometry(r.trim) }
  }, [poly, roofType, pitch, ridge, overhang])
  const openings = useMemo(() => placeOpenings(poly, cuts, hFt), [poly, cuts, hFt])
  useEffect(() => () => walls.dispose(), [walls])
  useEffect(() => () => Object.values(roof).forEach((g) => g.dispose()), [roof])

  const base = baseElevation(terrain, o)
  const position = toScene(o.position.x, o.position.n, base)
  const glow = selected ? 1 : hovered ? 0.4 : 0
  const color = typeof p.color === 'string' ? p.color : '#c4a77d'
  const roofColor = typeof p.roofColor === 'string' ? p.roofColor : '#3c4043'
  const siding: TextureName = p.siding === 'lap' ? 'lap' : p.siding === 'shingle' ? 'shingle' : 'batten'
  const roofTex: TextureName = roofType === 'sod' ? 'sod' : p.roofMat === 'shake' ? 'shake' : 'seam'
  const roofTint = roofType === 'sod' ? '#6f8f4e' : roofColor
  const diagram = diagramColourFor(o.id)

  return (
    <group position={position} rotation={[0, (o.rotation * Math.PI) / 180, 0]} userData={{ objectId: o.id }}>
      <mesh geometry={walls} castShadow receiveShadow {...handlers}>
        <Surface kind="wall" style={style} color={color} texture={siding} diagramColor={diagram} glow={glow} />
      </mesh>
      <group position={[0, ftToM(hFt), 0]}>
        <mesh geometry={roof.roof} castShadow receiveShadow {...handlers}>
          <Surface kind="roof" style={style} color={roofTint} texture={roofTex} diagramColor={shade(diagram)} glow={glow} />
        </mesh>
        <mesh geometry={roof.gables} castShadow receiveShadow {...handlers}>
          <Surface kind="wall" style={style} color={color} texture={siding} diagramColor={diagram} glow={glow} />
        </mesh>
        <mesh geometry={roof.trim} castShadow receiveShadow {...handlers}>
          <Surface kind="trim" style={style} color={roofColor} diagramColor={shade(diagram)} glow={glow} />
        </mesh>
      </group>
      {openings.map((op, i) => (
        <OpeningMesh key={i} op={op} style={style} />
      ))}
      <Foundation o={o} poly={poly} base={base} style={style} />
    </group>
  )
}

const FRAME_M = 0.075
const FRAME_DEPTH_M = 0.12
const PROUD_M = 0.02

/** A framed opening on the wall face: glass for windows and sliders, a panel with a lite for doors. */
function OpeningMesh({ op, style }: { readonly op: Opening; readonly style: DisplayStyle }) {
  const w = ftToM(op.w)
  const h = ftToM(op.h)
  const pos: [number, number, number] = [ftToM(op.centre[0]), ftToM(op.centre[1]), ftToM(op.centre[2])]
  const yaw = Math.atan2(op.normal[0], op.normal[1])
  const bar = (x: number, y: number, bw: number, bh: number, key: string) => (
    <mesh key={key} position={[x, y, PROUD_M + FRAME_DEPTH_M / 2 - 0.03]} castShadow>
      <boxGeometry args={[bw, bh, FRAME_DEPTH_M]} />
      <Surface kind="frame" style={style} />
    </mesh>
  )
  return (
    <group position={pos} rotation={[0, yaw, 0]}>
      {op.kind === 'door' ? (
        <>
          <mesh position={[0, 0, PROUD_M]}>
            <planeGeometry args={[w, h]} />
            <Surface kind="door" style={style} />
          </mesh>
          <mesh position={[0, h * 0.18, PROUD_M + 0.005]}>
            <planeGeometry args={[w * 0.32, h * 0.45]} />
            <Surface kind="glass" style={style} />
          </mesh>
        </>
      ) : (
        <mesh position={[0, 0, PROUD_M]}>
          <planeGeometry args={[w, h]} />
          <Surface kind="glass" style={style} />
        </mesh>
      )}
      {bar(0, h / 2, w + FRAME_M * 2, FRAME_M, 'top')}
      {bar(0, -h / 2, w + FRAME_M * 2, FRAME_M, 'bottom')}
      {bar(-w / 2, 0, FRAME_M, h, 'left')}
      {bar(w / 2, 0, FRAME_M, h, 'right')}
      {op.kind === 'slider' && bar(0, 0, FRAME_M, h, 'mullion')}
      {op.kind === 'window' && op.w > 4 && bar(0, 0, FRAME_M * 0.7, h, 'mullion')}
      {op.kind === 'window' && (
        <mesh position={[0, -h / 2 - FRAME_M, PROUD_M + 0.06]} castShadow>
          <boxGeometry args={[w + 0.2, 0.05, 0.16]} />
          <Surface kind="frame" style={style} />
        </mesh>
      )}
    </group>
  )
}

/** Posts or a concrete skirt from the floor down into the ground, following the real slope under each point. */
function Foundation({ o, poly, base, style }: { readonly o: PlanObject; readonly poly: ReturnType<typeof localFootprint>; readonly base: number; readonly style: DisplayStyle }) {
  const terrain = usePlanStore((s) => s.site.terrain)
  const ground = (lx: number, lz: number) => {
    const [x, n] = localToSite(o.position, o.rotation, [lx, lz])
    return elevationAt(terrain, x, n)
  }
  const minGround = Math.min(...poly.map(([x, z]) => ground(x, z)))
  const drop = base - minGround
  const type = supportType(o.params.support, drop)
  const spacing = num(o.params.postSpacing, 8)
  const postIn = num(o.params.postSize, 6)
  const posts = useMemo(() => (type === 'posts' ? postPositions(poly, spacing, postIn) : []), [type, poly, spacing, postIn])
  const skirtDepthFt = (drop + EMBED_M) / 0.3048
  const skirt = useMemo(() => (type === 'skirt' && drop > -0.05 ? toGeometry(buildWalls(poly, skirtDepthFt)) : null), [type, poly, skirtDepthFt, drop])
  const rim = useMemo(() => (type === 'posts' ? toGeometry(buildWalls(poly, RIM_M / 0.3048)) : null), [type, poly])
  useEffect(() => () => skirt?.dispose(), [skirt])
  useEffect(() => () => rim?.dispose(), [rim])
  if (type === 'none') return null
  const size = Math.max(0.1, postIn * 0.0254)
  return (
    <group>
      {skirt && (
        <mesh geometry={skirt} position={[0, -(drop + EMBED_M), 0]} castShadow receiveShadow>
          <Surface kind="concrete" style={style} texture="concrete" />
        </mesh>
      )}
      {rim && (
        <mesh geometry={rim} position={[0, -RIM_M, 0]} castShadow receiveShadow>
          <Surface kind="wood" style={style} />
        </mesh>
      )}
      {posts.map(([x, z], i) => {
        const len = Math.max(0.1, base - ground(x, z) + EMBED_M - RIM_M)
        return (
          <mesh key={i} position={[ftToM(x), -RIM_M - len / 2, ftToM(z)]} castShadow>
            <boxGeometry args={[size, len, size]} />
            <Surface kind="wood" style={style} />
          </mesh>
        )
      })}
    </group>
  )
}

/** A slightly darker shade of a hex colour, for roofs in the Diagram style. */
function shade(hex: string): string {
  const v = parseInt(hex.slice(1), 16)
  const f = (c: number) => Math.round(c * 0.78)
  return `#${[(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => f(c).toString(16).padStart(2, '0')).join('')}`
}
