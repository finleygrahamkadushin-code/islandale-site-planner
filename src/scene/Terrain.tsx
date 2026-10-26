import { useEffect, useMemo } from 'react'
import type { Terrain as TerrainData } from '../site/types'
import { usePlanStore } from '../store/planStore'
import { buildTerrainGeometry, colourTerrain } from './terrainGeometry'
import { grass, perMetre } from './textures'
import { STYLE_GROUND, useDisplayStyle } from './useDisplayStyle'

export function Terrain({ terrain }: { readonly terrain: TerrainData }) {
  const style = useDisplayStyle()
  const tideFt = usePlanStore((s) => s.environment.tideFt)
  const geometry = useMemo(() => buildTerrainGeometry(terrain), [terrain])
  const grassMap = useMemo(() => perMetre(grass()), [])
  useEffect(() => colourTerrain(geometry, terrain, tideFt), [geometry, terrain, tideFt])
  useEffect(() => () => geometry.dispose(), [geometry])

  const realistic = style === 'realistic'
  return (
    <mesh geometry={geometry} receiveShadow name="terrain">
      {realistic ? (
        <meshStandardMaterial key="real" vertexColors map={grassMap} roughness={1} metalness={0} />
      ) : (
        <meshStandardMaterial key={style} color={STYLE_GROUND[style]} roughness={1} metalness={0} flatShading={style === 'diagram'} />
      )}
    </mesh>
  )
}
