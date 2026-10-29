import { useEffect, useMemo } from 'react'
import type { BufferGeometry } from 'three'
import type { Mass } from '../buildings/masses'
import type { StairMat } from '../buildings/stairPlan'
import { planWingStair } from '../buildings/stairWing'
import type { BuildingLook, MassSite, MeshHandlers } from './buildingLook'
import { toGeometry } from './meshData'
import { Surface } from './Surface'

/** Legacy colour of steel and cable handrails; posts take the shared wood surface (PLAN.md). */
const METAL = '#3b3f44'

interface Piece {
  readonly key: string
  readonly mat: StairMat
  readonly side?: -1 | 1
  readonly geometry: BufferGeometry
}

/**
 * A stair or ramp wing drawn from the stair planner (buildings/stairPlan):
 * nosed treads, closed risers, housed stringers, posts and a foot plate,
 * or a ramp's surface, curbs and skirts, with handrails by the building's
 * rail style. Each handrail mesh is named "rail" and lists its side's edge
 * (1 right, 3 left) in userData.edges.
 */
export function AccessMass({ masses, mi, look, site, handlers }: { readonly masses: readonly Mass[]; readonly mi: number; readonly look: BuildingLook; readonly site: MassSite; readonly handlers: MeshHandlers }) {
  const plan = useMemo(() => planWingStair(masses, mi, site), [masses, mi, site])
  const pieces = useMemo(() => {
    if (!plan) return []
    // one mesh per material, and per side for the handrails
    const byKey = new Map<string, { mat: StairMat; side?: -1 | 1; meshes: (typeof plan.items)[number]['mesh'][] }>()
    for (const it of plan.items) {
      const key = it.side ? `${it.mat}${it.side}` : it.mat
      const hit = byKey.get(key) ?? { mat: it.mat, side: it.side, meshes: [] }
      hit.meshes.push(it.mesh)
      byKey.set(key, hit)
    }
    return [...byKey].map(([key, g]): Piece => {
      const merged = { positions: g.meshes.flatMap((m) => m.positions), normals: g.meshes.flatMap((m) => m.normals), uvs: g.meshes.flatMap((m) => m.uvs) }
      return { key, mat: g.mat, side: g.side, geometry: toGeometry(merged) }
    })
  }, [plan])
  useEffect(() => () => pieces.forEach((p) => p.geometry.dispose()), [pieces])
  const style = site.railStyle ?? 'wood'
  const metal = style === 'steel' || style === 'cable'
  const { style: display, glow } = look
  return (
    <>
      {pieces.map((p) => {
        if (p.mat === 'rail')
          return (
            <mesh key={p.key} name="rail" geometry={p.geometry} userData={{ edges: [p.side && p.side > 0 ? 1 : 3] }} castShadow>
              {metal ? <Surface kind="trim" style={display} color={METAL} /> : <Surface kind="trim" style={display} color={look.color} diagramColor={look.diagram} />}
            </mesh>
          )
        if (p.mat === 'glass')
          return (
            <mesh key={p.key} name="rail-glass" geometry={p.geometry}>
              <Surface kind="railGlass" style={display} />
            </mesh>
          )
        return (
          <mesh key={p.key} geometry={p.geometry} castShadow receiveShadow {...handlers}>
            {p.mat === 'stair' ? (
              <Surface kind="deck" style={display} texture="deck" glow={glow} />
            ) : p.mat === 'trim' ? (
              <Surface kind="trim" style={display} color={look.color} diagramColor={look.diagram} glow={glow} />
            ) : p.mat === 'post' ? (
              <Surface kind="wood" style={display} glow={glow} />
            ) : (
              <Surface kind="concrete" style={display} texture="concrete" glow={glow} />
            )}
          </mesh>
        )
      })}
    </>
  )
}
