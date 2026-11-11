import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import type { BufferGeometry, Texture } from 'three'
import type { Terrain as TerrainData } from './types'
import { usePlanStore } from '../store/planStore'
import { usePointerGround } from './pointer'
import { useBoxSelect } from '../tools/useBoxSelect'
import { buildPatchGeometry, buildTerrainGeometry, colourTerrain, type GroundRules } from './terrainGeometry'
import { textureFor } from '../scene/Surface'
import { useEarthworks } from './earthworks/useEarthworks'
import { isPresenting } from '../present/present'
import { STYLE_GROUND, useDisplayStyle } from '../scene/useDisplayStyle'
import type { DisplayStyle } from '../store/types'

/** Styles whose ground carries vertex colours (beach, lot and site-rule tints); White model and Sketch stay plain. */
const TINTED: ReadonlySet<DisplayStyle> = new Set(['realistic', 'diagram'])

/** The ground: the survey grid, with a fine patch wherever buildings and ponds reshape it (cuts, fills, berms, bowls). */
export function Terrain({ terrain }: { readonly terrain: TerrainData }) {
  const style = useDisplayStyle()
  const tideFt = usePlanStore((s) => s.environment.tideFt)
  const parcel = usePlanStore((s) => s.site.parcel)
  const setbacks = usePlanStore((s) => s.setbacks)
  const { works } = useEarthworks()
  const rects = useMemo(() => works.fields.map((f) => f.rect), [works])
  const geometry = useMemo(() => buildTerrainGeometry(terrain, rects), [terrain, rects])
  const patches = useMemo(() => works.fields.map(buildPatchGeometry), [works])
  // the shared per-metre grass (the sod roofs' texture), not a clone of its own that was never disposed (R8.7)
  const grassMap = textureFor('sod', 'm')
  const tinted = TINTED.has(style)
  // recolour only when the ground, tide, style or setbacks change (never during a drag)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const rules: GroundRules | null = tinted && setbacks.shown ? { parcel, settings: { setbacks, rules: true } } : null
    ;[geometry, ...patches].forEach((g) => colourTerrain(g, tideFt, rules))
    // colours written outside React: the view draws on demand (R8.1), so ask for the frame that shows them
    invalidate()
  }, [geometry, patches, tideFt, tinted, parcel, setbacks, invalidate])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => patches.forEach((g) => g.dispose()), [patches])
  return (
    <>
      <Ground geometry={geometry} style={style} map={grassMap} name="terrain" />
      {patches.map((g, i) => (
        <Ground key={i} geometry={g} style={style} map={grassMap} name="terrain-patch" />
      ))}
    </>
  )
}

/**
 * The pointer on the ground: the readout follows it (usePointerGround), the
 * Place tool's ghost follows it and a click puts the item down (placeItem
 * snaps it), and the Measure tool's click picks a point on the ground.
 */
const groundMove = (e: ThreeEvent<PointerEvent>) => {
  usePointerGround.getState().setAt({ x: e.point.x, n: -e.point.z })
  const s = usePlanStore.getState()
  if (!s.placing) return
  s.setPlacing({ ...s.placing, at: { x: e.point.x, n: -e.point.z } })
}
const groundLeave = () => usePointerGround.getState().setAt(null)
const groundClick = (e: ThreeEvent<MouseEvent>) => {
  if (isPresenting()) return
  const s = usePlanStore.getState()
  if (s.measuring) {
    e.stopPropagation()
    s.measurePoint({ x: e.point.x, n: -e.point.z, z: e.point.y })
    return
  }
  if (!s.placing) return
  e.stopPropagation()
  const { item, rotation, at } = s.placing
  s.placeItem(item, { x: e.point.x, n: -e.point.z }, rotation)
  // Shift-click places one and stays in Place (4B), as the old planner did
  if (e.nativeEvent.shiftKey) s.setPlacing({ item, rotation, at })
}

function Ground({ geometry, style, map, name }: { readonly geometry: BufferGeometry; readonly style: ReturnType<typeof useDisplayStyle>; readonly map: Texture; readonly name: string }) {
  const box = useBoxSelect()
  // Diagram tints the ground only while the Setbacks layer is shown; otherwise it keeps its flat colour
  const tinted = usePlanStore((s) => s.setbacks.shown)
  return (
    <mesh
      geometry={geometry}
      receiveShadow
      name={name}
      onPointerDown={(e) => !isPresenting() && box.onPointerDown(e)}
      onPointerMove={groundMove}
      onPointerLeave={groundLeave}
      onClick={groundClick}
    >
      {style === 'realistic' ? (
        <meshStandardMaterial key="real" vertexColors map={map} roughness={1} metalness={0} />
      ) : style === 'diagram' && tinted ? (
        <meshStandardMaterial key="diagram" vertexColors roughness={1} metalness={0} />
      ) : (
        <meshStandardMaterial key={style} color={STYLE_GROUND[style]} roughness={1} metalness={0} />
      )}
    </mesh>
  )
}
