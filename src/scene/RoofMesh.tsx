import { useEffect, useMemo } from 'react'
import type { LocalPoint } from '../buildings/footprint'
import type { Mass } from '../buildings/masses'
import { buildRoof } from '../buildings/roof'
import { ftToM } from '../site/units'
import { shade, type BuildingLook, type MeshHandlers } from './buildingLook'
import { toGeometry } from './meshData'
import { Surface, type TextureName } from './Surface'

/** A mass's roof set on its wall top: roof surface, gable infill in the siding, fascia and soffits. */
export function RoofMesh({ m, poly, look, handlers }: { readonly m: Mass; readonly poly: readonly LocalPoint[]; readonly look: BuildingLook; readonly handlers: MeshHandlers }) {
  const roof = useMemo(() => {
    const r = buildRoof(poly, { type: m.roof, pitch: m.pitch, ridge: m.ridge, overhangFt: m.overhang })
    return { roof: toGeometry(r.roof), gables: toGeometry(r.gables), trim: toGeometry(r.trim) }
  }, [poly, m.roof, m.pitch, m.ridge, m.overhang])
  useEffect(() => () => Object.values(roof).forEach((g) => g.dispose()), [roof])
  if (m.roof === 'none') return null
  const tex: TextureName = m.roof === 'sod' ? 'sod' : look.roofMat === 'shake' ? 'shake' : 'seam'
  const tint = m.roof === 'sod' ? '#6f8f4e' : look.roofColor
  const { style, glow, diagram } = look
  return (
    <group position={[0, ftToM(m.h), 0]}>
      <mesh geometry={roof.roof} castShadow receiveShadow {...handlers}>
        <Surface kind="roof" style={style} color={tint} texture={tex} diagramColor={shade(diagram)} glow={glow} />
      </mesh>
      <mesh geometry={roof.gables} castShadow receiveShadow {...handlers}>
        <Surface kind="wall" style={style} color={look.color} texture={look.siding} diagramColor={diagram} glow={glow} />
      </mesh>
      <mesh geometry={roof.trim} castShadow receiveShadow {...handlers}>
        <Surface kind="trim" style={style} color={look.roofColor} diagramColor={shade(diagram)} glow={glow} />
      </mesh>
    </group>
  )
}
