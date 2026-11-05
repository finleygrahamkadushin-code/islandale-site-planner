import { useEffect, useMemo } from 'react'
import { pieceMesh } from './pieceMesh'
import { pieceSurface, SURFACE_COLORS } from './pieces'
import type { PlanObject } from '../store/types'
import { toScene } from '../scene/frame'
import { toGeometry } from '../scene/meshData'
import { Surface } from '../scene/Surface'
import { useDisplayStyle } from '../scene/useDisplayStyle'
import { useEarthworks } from '../site/earthworks/useEarthworks'
import { useObjectInteraction } from '../scene/useObjectInteraction'

/** A ramp, stair, landing or boardwalk path piece (old walkMesh), built from its end levels and the ground. */
export function PathPieceMesh({ o }: { readonly o: PlanObject }) {
  const { drawnGround } = useEarthworks()
  const style = useDisplayStyle()
  const { selected, hovered, handlers } = useObjectInteraction(o)
  const built = useMemo(() => pieceMesh(o, drawnGround), [o, drawnGround])
  const parts = useMemo(() => built?.items.map((it) => ({ mat: it.mat, geometry: toGeometry(it.mesh) })) ?? [], [built])
  useEffect(() => () => parts.forEach((p) => p.geometry.dispose()), [parts])
  if (!built) return null
  const glow = selected ? 1 : hovered ? 0.4 : 0
  const surface = SURFACE_COLORS[pieceSurface(o)]
  return (
    <group position={toScene(o.position.x, o.position.n, built.base)} rotation={[0, (o.rotation * Math.PI) / 180, 0]} userData={{ objectId: o.id }}>
      <group rotation={[0, built.rotY, 0]}>
        {parts.map((p, i) => (
          <mesh key={i} geometry={p.geometry} castShadow receiveShadow name={p.mat === 'rail' ? 'rail' : undefined} {...handlers}>
            {p.mat === 'stair' ? (
              <Surface kind="deck" style={style} color={surface} texture={pieceSurface(o) === 'boardwalk' ? 'deck' : 'concrete'} glow={glow} />
            ) : p.mat === 'post' ? (
              <Surface kind="wood" style={style} glow={glow} />
            ) : p.mat === 'rail' ? (
              <Surface kind="wood" style={style} color="#6e5a44" glow={glow} />
            ) : p.mat === 'glass' ? (
              <Surface kind="railGlass" style={style} />
            ) : (
              <Surface kind="concrete" style={style} texture="concrete" glow={glow} />
            )}
          </mesh>
        ))}
      </group>
    </group>
  )
}
