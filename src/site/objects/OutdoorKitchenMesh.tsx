import { useEffect, useMemo } from 'react'
import { BoxGeometry, BufferAttribute, BufferGeometry } from 'three'
import { usePlanStore } from '../../store/planStore'
import type { PlanObject } from '../../store/types'
import { toScene } from '../../scene/frame'
import { baseElevation } from '../../scene/placement'
import { Surface, type SurfaceKind } from '../../scene/Surface'
import { useDisplayStyle } from '../../scene/useDisplayStyle'
import { useObjectInteraction } from '../../scene/useObjectInteraction'
import { useEarthworks } from '../earthworks/useEarthworks'
import { outdoorKitchenParts, type OutdoorKitchenPartKind } from './outdoorKitchen'
import { boulderRocks, type Rock } from './siteObjects'
import { M_PER_FT as FT } from '../units'

/** Each part's material: the stone of the boulder, a lighter stone top, steel for the sink and grill, and dark openings. */
const MATERIAL: Readonly<Record<OutdoorKitchenPartKind, { readonly kind: SurfaceKind; readonly color: string }>> = {
  stone: { kind: 'concrete', color: '#6f6c66' },
  boulder: { kind: 'concrete', color: '#9d9a93' },
  counter: { kind: 'pad', color: '#d8d2c4' },
  basin: { kind: 'frame', color: '#9aa1a8' },
  steel: { kind: 'frame', color: '#9aa1a8' },
  tap: { kind: 'frame', color: '#b9bfc6' },
  recess: { kind: 'frame', color: '#2b2622' },
}

/**
 * An outdoor kitchen built into rock (see outdoorKitchen.ts). Stands on the
 * ground, or at its `standZ` when that is set, e.g. on a roof deck.
 */
export function OutdoorKitchenMesh({ o }: { readonly o: PlanObject }) {
  const terrain = usePlanStore((s) => s.site.terrain)
  const { ground } = useEarthworks()
  const { selected, hovered, handlers } = useObjectInteraction(o)
  const style = useDisplayStyle()
  const parts = useMemo(() => outdoorKitchenParts(o.params), [o.params])
  const geometries = useMemo(() => parts.map((p) => new BoxGeometry(p.size[0], p.size[1], p.size[2])), [parts])
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries])
  // the rock it is built into: a faceted boulder cluster in place of each end block, and low rocks along the front foot
  const rocks = useMemo(() => kitchenRocks(parts, o.params), [parts, o.params])
  const rockGeometries = useMemo(() => rocks.map((r) => rockGeometry(r.rock)), [rocks])
  useEffect(() => () => rockGeometries.forEach((g) => g.dispose()), [rockGeometries])
  const base = baseElevation(terrain, o, ground)
  const { x, n } = o.position
  const glow = selected ? 1 : hovered ? 0.4 : 0
  return (
    <group position={toScene(x, n, base)} rotation={[0, (o.rotation * Math.PI) / 180, 0]} userData={{ objectId: o.id }}>
      {rockGeometries.map((g, i) => (
        <mesh key={`rock${i}`} geometry={g} position={[rocks[i].x, 0, rocks[i].z]} castShadow receiveShadow {...handlers}>
          <Surface kind="concrete" style={style} glow={glow} vertexColors />
        </mesh>
      ))}
      {parts.map((p, i) => {
        if (p.kind === 'boulder' || p.kind === 'recess') return null
        const m = MATERIAL[p.kind]
        return (
          <mesh key={i} geometry={geometries[i]} position={p.centre} castShadow receiveShadow {...handlers}>
            <Surface kind={m.kind} style={style} color={m.color} diagramColor={m.color} glow={glow} />
          </mesh>
        )
      })}
    </group>
  )
}

interface PlacedRock {
  readonly x: number
  readonly z: number
  readonly rock: Rock
}

/** A small stable hash of the kitchen's size, so its rocks never change between renders. */
function sizeSeed(params: Readonly<Record<string, unknown>>): number {
  const str = ['w', 'd', 'h', 'shape', 'ret'].map((k) => String(params[k] ?? '')).join('|')
  let h = 2166136261
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return (h >>> 0) % 100000 || 1
}

/** Boulder clusters where the end blocks are, and a row of low rocks along the front of the stone body. */
function kitchenRocks(parts: ReturnType<typeof outdoorKitchenParts>, params: Readonly<Record<string, unknown>>): PlacedRock[] {
  const seed = sizeSeed(params)
  const out: PlacedRock[] = []
  parts.forEach((p, i) => {
    if (p.kind === 'boulder') {
      const size = { w: (p.size[0] * 1.5) / FT, d: (p.size[2] * 1.25) / FT, h: (p.size[1] * 1.15) / FT, count: 3 }
      for (const rock of boulderRocks(size, seed + i * 31)) out.push({ x: p.centre[0], z: p.centre[2], rock })
    }
  })
  // low rocks at the foot of the front face, along the stone body
  const stones = parts.filter((p) => p.kind === 'stone')
  if (stones.length) {
    const xs = stones.map((p) => p.centre[0])
    const front = Math.max(...stones.map((p) => p.centre[2] + p.size[2] / 2))
    const x0 = Math.min(...xs), x1 = Math.max(...xs)
    const top = Math.min(...parts.filter((p) => p.kind === 'counter').map((p) => p.centre[1] - p.size[1] / 2))
    const faceFt = Math.max(1, (top - 0.04) / FT)
    const n = Math.max(2, Math.round((x1 - x0) / 0.9))
    for (let k = 0; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n
      // a rock face up to just under the countertop, with a lower rock bedded at its foot
      for (const rock of boulderRocks({ w: 3.4, d: 1.3, h: faceFt * 1.7, count: 1 }, seed + 500 + k * 17)) out.push({ x, z: front - 0.12, rock })
      for (const rock of boulderRocks({ w: 2.2, d: 1.4, h: 1.1, count: 1 }, seed + 900 + k * 23)) out.push({ x: x + 0.35, z: front + 0.05, rock })
    }
  }
  return out
}

function rockGeometry(r: Rock): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(r.positions), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(r.normals), 3))
  g.setAttribute('color', new BufferAttribute(new Float32Array(r.colors), 3))
  g.computeBoundingSphere()
  return g
}
