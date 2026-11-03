import { useEffect, useMemo } from 'react'
import { Edges } from '@react-three/drei'
import { DoubleSide, type BufferGeometry } from 'three'
import { footprintParams, localFootprint, siteFootprint } from '../buildings/footprint'
import { poolLayout, poolLevel, poolMeshes, poolShellDepth } from '../site/pool'
import type { DisplayStyle, PlanObject } from '../store/types'
import { toScene } from './frame'
import { toGeometry } from './meshData'
import { Surface } from './Surface'
import { useDisplayStyle } from './useDisplayStyle'
import { useEarthworks } from './useEarthworks'
import { useObjectInteraction } from './useObjectInteraction'

const WATER = '#3fb7c9'
const COPING = '#ece6da'
const SHELL = '#7f8382'
const POOL_FLOOR = '#1f6f86'
const LINING = '#2b8aa3'

/**
 * A pool (legacy poolMesh): a level coping round its outline just above the
 * highest ground (or at its fixed `elev`), a concrete shell down past the
 * lowest ground, a tiled lining and floor, the water 4 cm under the coping,
 * and sheets of water spilling over its infinity edges.
 */
export function PoolMesh({ o }: { readonly o: PlanObject }) {
  const { drawnGround } = useEarthworks()
  const { selected, hovered, handlers } = useObjectInteraction(o)
  const style = useDisplayStyle()
  const layout = useMemo(() => poolLayout(localFootprint(footprintParams(o)), o.params), [o.params]) // eslint-disable-line react-hooks/exhaustive-deps
  const round = siteFootprint(o).map(([x, n]) => drawnGround(x, n))
  const level = poolLevel(o.params, round)
  const depth = poolShellDepth(level, round)
  const parts = useMemo(() => {
    const m = poolMeshes(layout, depth)
    return { coping: toGeometry(m.coping), shell: toGeometry(m.shell), floor: toGeometry(m.floor), lining: toGeometry(m.lining), water: toGeometry(m.water), spill: toGeometry(m.spill) }
  }, [layout, depth])
  useEffect(() => () => Object.values(parts).forEach((g: BufferGeometry) => g.dispose()), [parts])
  const water = typeof o.params.color === 'string' ? o.params.color : WATER
  const shell = typeof o.params.wallColor === 'string' ? o.params.wallColor : SHELL
  const glow = selected ? 1 : hovered ? 0.4 : 0
  return (
    <group position={toScene(o.position.x, o.position.n, level)} rotation={[0, (o.rotation * Math.PI) / 180, 0]} userData={{ objectId: o.id }}>
      <mesh geometry={parts.coping} castShadow receiveShadow {...handlers}>
        <Surface kind="pad" style={style} color={COPING} texture="concrete" glow={glow} />
      </mesh>
      <mesh geometry={parts.shell} castShadow receiveShadow {...handlers}>
        <Surface kind="pad" style={style} color={shell} texture="concrete" glow={glow} />
      </mesh>
      <mesh geometry={parts.floor} receiveShadow>
        <Surface kind="pad" style={style} color={POOL_FLOOR} />
      </mesh>
      <mesh geometry={parts.lining} receiveShadow>
        <Surface kind="pad" style={style} color={LINING} layer={1} />
      </mesh>
      <mesh geometry={parts.water} receiveShadow renderOrder={2} {...handlers}>
        <Water style={style} color={water} opacity={0.8} />
      </mesh>
      <mesh geometry={parts.spill} renderOrder={2} {...handlers}>
        <Water style={style} color={water} opacity={0.55} sheet />
      </mesh>
    </group>
  )
}

/** Pool water in each display style: clear and glossy in Realistic, a flat water tone in the others. */
function Water({ style, color, opacity, sheet = false }: { readonly style: DisplayStyle; readonly color: string; readonly opacity: number; readonly sheet?: boolean }) {
  const side = sheet ? DoubleSide : undefined
  if (style === 'realistic') {
    return <meshPhysicalMaterial color={color} transparent opacity={opacity} roughness={0.05} metalness={0} clearcoat={1} clearcoatRoughness={0.05} envMapIntensity={1.6} side={side} depthWrite={!sheet} />
  }
  if (style === 'diagram') return <meshLambertMaterial color="#8fc3d6" transparent={sheet} opacity={sheet ? 0.6 : 1} side={side} />
  return (
    <>
      <meshStandardMaterial color="#d7e2e6" roughness={0.4} transparent={sheet} opacity={sheet ? 0.6 : 1} side={side} />
      {style === 'sketch' && !sheet && <Edges color="#2a2a2a" threshold={20} />}
    </>
  )
}
