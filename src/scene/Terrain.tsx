import { useMemo } from 'react'
import type { Terrain as TerrainData } from '../site/types'
import { buildTerrainGeometry } from './terrainGeometry'

export function Terrain({ terrain }: { readonly terrain: TerrainData }) {
  const geometry = useMemo(() => buildTerrainGeometry(terrain), [terrain])
  return (
    <mesh geometry={geometry} receiveShadow name="terrain">
      <meshStandardMaterial color="#6f7d5c" roughness={1} metalness={0} />
    </mesh>
  )
}
