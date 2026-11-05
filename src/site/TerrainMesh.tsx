import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import type { BufferGeometry } from 'three'
import type { Terrain as TerrainData } from './types'
import { usePlanStore } from '../store/planStore'
import { usePointerGround } from './pointer'
import { buildPatchGeometry, buildTerrainGeometry, colourTerrain } from './terrainGeometry'
import { grass, perMetre } from '../scene/textures'
import { useEarthworks } from './earthworks/useEarthworks'
import { STYLE_GROUND, useDisplayStyle } from '../scene/useDisplayStyle'

/** The ground: the survey grid, with a fine patch wherever buildings and ponds reshape it (cuts, fills, berms, bowls). */
export function Terrain({ terrain }: { readonly terrain: TerrainData }) {
  const style = useDisplayStyle()
  const tideFt = usePlanStore((s) => s.environment.tideFt)
  const { works } = useEarthworks()
  const rects = useMemo(() => works.fields.map((f) => f.rect), [works])
  const geometry = useMemo(() => buildTerrainGeometry(terrain, rects), [terrain, rects])
  const patches = useMemo(() => works.fields.map(buildPatchGeometry), [works])
  const grassMap = useMemo(() => perMetre(grass()), [])
  useEffect(() => [geometry, ...patches].forEach((g) => colourTerrain(g, tideFt)), [geometry, patches, tideFt])
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
  const s = usePlanStore.getState()
  if (s.measuring) {
    e.stopPropagation()
    s.measurePoint({ x: e.point.x, n: -e.point.z, z: e.point.y })
    return
  }
  if (!s.placing) return
  e.stopPropagation()
  const { item, rotation } = s.placing
  s.placeItem(item, { x: e.point.x, n: -e.point.z }, rotation)
}

function Ground({ geometry, style, map, name }: { readonly geometry: BufferGeometry; readonly style: ReturnType<typeof useDisplayStyle>; readonly map: ReturnType<typeof perMetre>; readonly name: string }) {
  return (
    <mesh geometry={geometry} receiveShadow name={name} onPointerMove={groundMove} onPointerLeave={groundLeave} onClick={groundClick}>
      {style === 'realistic' ? (
        <meshStandardMaterial key="real" vertexColors map={map} roughness={1} metalness={0} />
      ) : (
        <meshStandardMaterial key={style} color={STYLE_GROUND[style]} roughness={1} metalness={0} />
      )}
    </mesh>
  )
}
