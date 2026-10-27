import { useEffect, useMemo } from 'react'
import type { BufferGeometry } from 'three'
import { cutCells } from '../site/earthworks'
import type { Terrain as TerrainData } from '../site/types'
import { usePlanStore } from '../store/planStore'
import { buildPatchGeometry, buildTerrainGeometry, colourTerrain } from './terrainGeometry'
import { grass, perMetre } from './textures'
import { useEarthworks } from './useEarthworks'
import { STYLE_GROUND, useDisplayStyle } from './useDisplayStyle'

/** The ground: the survey grid, with a fine patch wherever a building is set into the slope. */
export function Terrain({ terrain }: { readonly terrain: TerrainData }) {
  const style = useDisplayStyle()
  const tideFt = usePlanStore((s) => s.environment.tideFt)
  const { cuts, ground } = useEarthworks()
  const rects = useMemo(() => cuts.map((c) => cutCells(terrain, c)), [cuts, terrain])
  const geometry = useMemo(() => buildTerrainGeometry(terrain, rects), [terrain, rects])
  const patches = useMemo(() => rects.map((r) => buildPatchGeometry(terrain, r, ground)), [terrain, rects, ground])
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

function Ground({ geometry, style, map, name }: { readonly geometry: BufferGeometry; readonly style: ReturnType<typeof useDisplayStyle>; readonly map: ReturnType<typeof perMetre>; readonly name: string }) {
  return (
    <mesh geometry={geometry} receiveShadow name={name}>
      {style === 'realistic' ? (
        <meshStandardMaterial key="real" vertexColors map={map} roughness={1} metalness={0} />
      ) : (
        <meshStandardMaterial key={style} color={STYLE_GROUND[style]} roughness={1} metalness={0} />
      )}
    </mesh>
  )
}
