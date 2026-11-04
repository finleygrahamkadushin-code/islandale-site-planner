import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, Color, ConeGeometry, DoubleSide, Euler, Matrix4, OctahedronGeometry, Quaternion, Vector3, type InstancedMesh } from 'three'
import { isRoofFinish, isWallKind, ROOF_FINISH_COLOUR, ROOF_FINISH_TEXTURE, WALL_KIND_TEXTURE, type RoofFinish } from '../buildings/finishes'
import { CURVED_SHAPES, type LocalPoint } from '../buildings/footprint'
import type { V3 } from '../buildings/geom'
import type { Mass } from '../buildings/masses'
import { buildRoof, normaliseRoof, roofParamsOf, sculptOptionsOf, tipColumnTop, TIP_POST, type TipPost } from '../buildings/roof'
import { glassMullions, isSculpted, sculptedRoof, type RoofLineKind, type TuftPlacement } from '../buildings/sculptRoof'
import { ftToM } from '../site/units'
import { usePlanStore } from '../store/planStore'
import { isPainted, shade, type BuildingLook, type MeshHandlers } from './buildingLook'
import { toGeometry } from './meshData'
import { Surface, type SurfaceKind, type TextureName } from './Surface'

/** Legacy sculptRoof timber soffit, porch struts and the dark frame round a glass roof. */
const SOFFIT_TIMBER = '#a07c55'
const STRUT_WOOD = '#5d4c3b'
const FASCIA_COLOUR: Partial<Record<RoofFinish, string>> = { glass: '#4a5258', copper: '#5e9784', sod: '#6b5136' }
/** Legacy EDGE_MAT, ROOF_RIB_MAT and ROOF_MULLION_MAT. */
const LINE_LOOK: Readonly<Record<RoofLineKind, { readonly color: string; readonly opacity: number }>> = {
  edge: { color: '#2b2622', opacity: 0.3 },
  rib: { color: '#2b2622', opacity: 0.2 },
  contour: { color: '#2b2622', opacity: 0.2 },
  crown: { color: '#2b2622', opacity: 0.2 },
  seam: { color: '#2b2622', opacity: 0.2 },
  mullion: { color: '#2f3a40', opacity: 0.75 },
}

/** How a roof's surface is drawn: its finish and the Surface kind, texture and colour that go with it. */
export interface RoofLook {
  readonly finish: RoofFinish | null
  readonly kind: Extract<SurfaceKind, 'roof' | 'clearGlass'>
  readonly texture?: TextureName
  readonly color?: string
}

/**
 * The roof's material and colour (legacy roofMatOf + roofFinish), for every
 * roof type: glass is see-through, copper and sod take their own colour,
 * metal the roof colour; with no finish, the building's roof colour and
 * texture. The one place the finish is chosen, so the exterior resolver can
 * take it over.
 */
export function roofFinish(look: BuildingLook, mi: number): RoofLook {
  const r = look.ext(mi, 'roof')
  const finish = isRoofFinish(r.mat) ? r.mat : null
  const painted = isPainted(r)
  if (finish === 'glass') return { finish, kind: 'clearGlass' }
  // metal takes a roof colour of the scheme's or a painted one, else its own grey (legacy base || #8d949a)
  if (finish === 'metal') return { finish, kind: 'roof', texture: ROOF_FINISH_TEXTURE.metal, color: painted || r.src.color === 'scheme' ? r.color : ROOF_FINISH_COLOUR.metal }
  if (finish) return { finish, kind: 'roof', texture: ROOF_FINISH_TEXTURE[finish], color: painted ? r.color : ROOF_FINISH_COLOUR[finish] }
  return { finish, kind: 'roof', texture: look.roofMat === 'shake' ? 'shake' : 'seam', color: r.color }
}

/** Fascia and soffit: trim painted as trim (not trim following painted walls), else `fallback`. */
function trimColour(look: BuildingLook, mi: number, fallback: string | undefined): string | undefined {
  const t = look.ext(mi, 'trim')
  return isPainted(t) && t.via !== 'wall' ? t.color : fallback
}

/** Gable ends and dome or sod cladding belong to the mass's walls as a whole: Paint picks the mass, not one wall. */
const MASS_WALL = { part: 'wall', massWide: true } as const
const isCurvedMass = (m: Mass) => (CURVED_SHAPES as readonly string[]).includes(m.shape)

/** Gable ends and the cladding under a dome or sod roof are wall: the mass's own wall kind and colour, else the building's (as WallMass draws its walls). */
interface WallInfillLook {
  readonly glass: boolean
  readonly color: string
  readonly texture: TextureName
}

function wallInfill(look: BuildingLook, mi: number, m: Mass): WallInfillLook {
  // the mass's walls, not one of them: a curved mass is one wall (0), a straight one reads its mass-wide finish
  const r = look.ext(mi, 'wall', isCurvedMass(m) ? 0 : null)
  const kind = isWallKind(r.kind) ? r.kind : null
  return { glass: kind === 'glass', color: r.color, texture: kind && kind !== 'glass' ? WALL_KIND_TEXTURE[kind] : look.siding }
}

function WallInfillSurface({ m, mi, look }: { readonly m: Mass; readonly mi: number; readonly look: BuildingLook }) {
  const w = wallInfill(look, mi, m)
  if (w.glass) return <Surface kind="clearGlass" style={look.style} />
  return <Surface kind="wall" style={look.style} color={w.color} texture={w.texture} diagramColor={look.diagram} glow={look.glow} />
}

interface RoofMeshProps {
  readonly m: Mass
  /** The mass's index in the building, for its exterior finishes. */
  readonly mi: number
  readonly poly: readonly LocalPoint[]
  readonly look: BuildingLook
  readonly handlers: MeshHandlers
}

/** A mass's roof set on its wall top, classic or sculpted, in its finish; nothing while Roofs off is on. */
export function RoofMesh({ m, mi, poly, look, handlers }: RoofMeshProps) {
  const roofsOff = usePlanStore((s) => s.roofsOff)
  const type = normaliseRoof(m.roof)
  if (type === 'none' || roofsOff) return null
  const finish = roofFinish(look, mi)
  return (
    <group position={[0, ftToM(m.h), 0]}>
      {isSculpted(type) ? (
        <SculptedRoofMesh m={m} mi={mi} poly={poly} look={look} finish={finish} handlers={handlers} />
      ) : (
        <ClassicRoofMesh m={m} mi={mi} poly={poly} look={look} finish={finish} handlers={handlers} />
      )}
    </group>
  )
}

interface PartProps extends RoofMeshProps {
  readonly finish: RoofLook
}

/** Gable, hip, shed, gambrel, butterfly, pyramid, prow and flat: roof, gable infill in the siding, fascia and soffit, prow clerestory and tip column. */
function ClassicRoofMesh({ m, mi, poly, look, finish, handlers }: PartProps) {
  const built = useMemo(() => buildRoof(poly, roofParamsOf(m, finish.finish)), [poly, m, finish.finish])
  const geo = useMemo(() => ({ roof: toGeometry(built.roof), gables: toGeometry(built.gables), trim: toGeometry(built.trim), glass: toGeometry(built.glass) }), [built])
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo])
  const glass = finish.kind === 'clearGlass'
  const mullions = useMemo(() => (glass ? lineGeometry(glassMullions(built.roof)) : null), [built, glass])
  useEffect(() => () => mullions?.dispose(), [mullions])
  const { style, glow, diagram } = look
  return (
    <>
      <mesh geometry={geo.roof} castShadow={!glass} receiveShadow userData={{ part: 'roof' }} {...handlers}>
        <Surface kind={finish.kind} style={style} color={finish.color} texture={finish.texture} diagramColor={shade(diagram)} glow={glow} />
      </mesh>
      <mesh geometry={geo.gables} castShadow receiveShadow userData={MASS_WALL} {...handlers}>
        <WallInfillSurface m={m} mi={mi} look={look} />
      </mesh>
      <mesh geometry={geo.trim} castShadow={!glass} receiveShadow userData={{ part: 'trim' }} {...handlers}>
        {/* a glass roof is glass right through, as the old planner swaps the whole roof's material */}
        {glass ? <Surface kind="clearGlass" style={style} /> : <Surface kind="trim" style={style} color={trimColour(look, mi, finish.color ?? look.roofColor)} diagramColor={shade(diagram)} glow={glow} />}
      </mesh>
      <mesh geometry={geo.glass} userData={{ part: 'glass' }} {...handlers}>
        <Surface kind="glass" style={style} />
      </mesh>
      {mullions && <RoofLineSegments geometry={mullions} kind="mullion" />}
      {built.tip && <TipColumn tip={built.tip} wallM={ftToM(m.h)} look={look} handlers={handlers} />}
    </>
  )
}

/** Dome, vault, shell, saddle and sod: the slab with its soffit and fascia, infill or struts below, linework, and grass on sod. */
function SculptedRoofMesh({ m, mi, poly, look, finish, handlers }: PartProps) {
  const r = useMemo(() => sculptedRoof(poly, sculptOptionsOf(roofParamsOf(m, finish.finish))), [poly, m, finish.finish])
  const geo = useMemo(() => ({ slab: toGeometry(r.slab), soffit: toGeometry(r.soffit), fascia: toGeometry(r.fascia), infill: toGeometry(r.infill), struts: toGeometry(r.struts) }), [r])
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo])
  const lines = useMemo(() => r.lines.map((l) => ({ kind: l.kind, geometry: lineGeometry(l.segments) })), [r])
  useEffect(() => () => lines.forEach((l) => l.geometry.dispose()), [lines])
  const { style, glow, diagram } = look
  const glass = finish.kind === 'clearGlass'
  const fasciaColour = trimColour(look, mi, finish.finish ? FASCIA_COLOUR[finish.finish] : undefined)
  return (
    <>
      <mesh geometry={geo.slab} castShadow={!glass} receiveShadow userData={{ part: 'roof' }} {...handlers}>
        <Surface kind={finish.kind} style={style} color={finish.color} texture={finish.texture} diagramColor={shade(diagram)} glow={glow} />
      </mesh>
      <mesh geometry={geo.soffit} castShadow={!glass} receiveShadow userData={{ part: 'trim' }} {...handlers}>
        {glass ? <Surface kind="clearGlass" style={style} /> : <Surface kind="trim" style={style} color={trimColour(look, mi, SOFFIT_TIMBER)} diagramColor={shade(diagram)} glow={glow} />}
      </mesh>
      <mesh geometry={geo.fascia} castShadow={!glass} receiveShadow userData={{ part: 'trim' }} {...handlers}>
        {fasciaColour ? (
          <Surface kind="trim" style={style} color={fasciaColour} diagramColor={shade(diagram)} glow={glow} />
        ) : (
          <Surface kind="roof" style={style} color={finish.color} texture={finish.texture} diagramColor={shade(diagram)} glow={glow} />
        )}
      </mesh>
      {r.infillKind === 'glass' ? (
        <mesh geometry={geo.infill} receiveShadow userData={{ part: 'glass' }} {...handlers}>
          <Surface kind="clearGlass" style={style} />
        </mesh>
      ) : (
        <mesh geometry={geo.infill} castShadow receiveShadow userData={MASS_WALL} {...handlers}>
          <WallInfillSurface m={m} mi={mi} look={look} />
        </mesh>
      )}
      <mesh geometry={geo.struts} castShadow userData={{ part: 'post' }} {...handlers}>
        <Surface kind="wood" style={style} color={STRUT_WOOD} glow={glow} />
      </mesh>
      {lines.map((l, i) => (
        <RoofLineSegments key={`${l.kind}${i}`} geometry={l.geometry} kind={l.kind} />
      ))}
      {style === 'realistic' && r.tufts.length > 0 && <RoofTufts tufts={r.tufts} blooms={r.blooms} handlers={handlers} />}
    </>
  )
}

function lineGeometry(points: readonly V3[]): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(points.flat()), 3))
  g.computeBoundingSphere()
  return g
}

/** Ribs, contours, seams, mullions and the slab's edges, as thin dark lines. */
function RoofLineSegments({ geometry, kind }: { readonly geometry: BufferGeometry; readonly kind: RoofLineKind }) {
  const { color, opacity } = LINE_LOOK[kind]
  return (
    <lineSegments geometry={geometry} userData={{ part: 'roof' }}>
      <lineBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </lineSegments>
  )
}

/** The slim column under a prow shell's tip (legacy roofTipPost), from 0.3 m above the floor to the roof's underside. */
function TipColumn({ tip, wallM, look, handlers }: { readonly tip: TipPost; readonly wallM: number; readonly look: BuildingLook; readonly handlers: MeshHandlers }) {
  const len = tipColumnTop(tip, wallM) + wallM - TIP_POST.base
  return (
    <mesh position={[tip.x, TIP_POST.base - wallM + len / 2, tip.z]} castShadow userData={{ part: 'post' }} {...handlers}>
      <cylinderGeometry args={[TIP_POST.topR, TIP_POST.footR, len, 12]} />
      <Surface kind="wood" style={look.style} glow={look.glow} />
    </mesh>
  )
}

/** Sod roof grass: one instanced cone per tuft and one bud per flower (legacy roofTufts, drawn in the realistic style only). */
function RoofTufts({ tufts, blooms, handlers }: { readonly tufts: readonly TuftPlacement[]; readonly blooms: readonly TuftPlacement[]; readonly handlers: MeshHandlers }) {
  const cone = useMemo(() => new ConeGeometry(0.12, 0.36, 5, 1, true).translate(0, 0.16, 0), [])
  const bud = useMemo(() => new OctahedronGeometry(0.06, 0), [])
  useEffect(
    () => () => {
      cone.dispose()
      bud.dispose()
    },
    [cone, bud],
  )
  return (
    <>
      <Instanced geometry={cone} items={tufts} handlers={handlers} />
      <Instanced geometry={bud} items={blooms} handlers={handlers} />
    </>
  )
}

function Instanced({ geometry, items, handlers }: { readonly geometry: BufferGeometry; readonly items: readonly TuftPlacement[]; readonly handlers: MeshHandlers }) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const M = new Matrix4()
    const Q = new Quaternion()
    const E = new Euler()
    const P = new Vector3()
    const S = new Vector3()
    const C = new Color()
    items.forEach((t, i) => {
      E.set(t.rotation[0], t.rotation[1], t.rotation[2])
      M.compose(P.set(t.at[0], t.at[1], t.at[2]), Q.setFromEuler(E), S.set(t.scale[0], t.scale[1], t.scale[2]))
      mesh.setMatrixAt(i, M)
      mesh.setColorAt(i, C.set(t.color))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [items])
  if (!items.length) return null
  return (
    <instancedMesh key={items.length} ref={ref} args={[geometry, undefined, items.length]} castShadow receiveShadow userData={{ part: 'roof' }} {...handlers}>
      <meshStandardMaterial roughness={0.95} side={DoubleSide} />
    </instancedMesh>
  )
}
