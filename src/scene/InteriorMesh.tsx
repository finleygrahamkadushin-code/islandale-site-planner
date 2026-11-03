import { useEffect, useMemo } from 'react'
import { ExtrudeGeometry, Quaternion, Shape, Vector3, type BufferGeometry } from 'three'
import { interior3d, type Bar3, type Box3, type Slab, type Wedge3 } from '../interiors/interior3d'
import type { DisplayStyle } from '../store/types'
import { M_PER_FT } from '../site/units'
import type { MeshHandlers } from './buildingLook'
import { Surface } from './Surface'

/**
 * A cabin's rooms in 3D, drawn in the building's frame from its floor
 * plans (interior3d): partitions with door and window gaps, the upper
 * slab with its stair holes, indoor stairs with handrails and guards, and
 * furniture boxes. Seen with Roofs off, or through the windows.
 */
export function InteriorMesh({ params, style, handlers }: { readonly params: Record<string, unknown>; readonly style: DisplayStyle; readonly handlers: MeshHandlers }) {
  const model = useMemo(() => interior3d(params), [params])
  if (!model.clusters.length && !model.slabs.length) return null
  return (
    <group scale={M_PER_FT} {...handlers}>
      {model.slabs.map((s, i) => (
        <SlabMesh key={`s${i}`} slab={s} style={style} />
      ))}
      {model.clusters.map((c, i) => (
        <group key={i} position={c.p as [number, number, number]} rotation={[0, c.ry, 0]}>
          {c.boxes.map((b, k) => (
            <BoxMesh key={k} b={b} style={style} />
          ))}
          {c.bars.map((b, k) => (
            <BarMesh key={`b${k}`} b={b} style={style} />
          ))}
          {c.cylinders.map((y, k) => (
            <mesh key={`c${k}`} position={y.p as [number, number, number]} castShadow userData={{ interiorPart: 'stair' }}>
              <cylinderGeometry args={[y.r, y.r, y.h, 12]} />
              <Surface kind="trim" style={style} color={y.color} />
            </mesh>
          ))}
          {c.wedges.map((w, k) => (
            <WedgeMesh key={`w${k}`} w={w} style={style} />
          ))}
        </group>
      ))}
    </group>
  )
}

function BoxMesh({ b, style }: { readonly b: Box3; readonly style: DisplayStyle }) {
  const wall = b.part === 'wall' || b.part === 'header' || b.part === 'sill'
  return (
    <mesh position={b.p as [number, number, number]} rotation={[b.rx ?? 0, b.ry ?? 0, 0]} castShadow receiveShadow userData={{ interiorPart: b.part }}>
      <boxGeometry args={b.size as [number, number, number]} />
      <Surface kind={wall ? 'wall' : 'trim'} style={style} color={b.color} />
    </mesh>
  )
}

const Z = new Vector3(0, 0, 1)

/** A square bar from a to b: a box along z turned onto the segment. */
function BarMesh({ b, style }: { readonly b: Bar3; readonly style: DisplayStyle }) {
  const { mid, q, len } = useMemo(() => {
    const a = new Vector3(...b.a)
    const d = new Vector3(...b.b).sub(a)
    return { mid: a.clone().addScaledVector(d, 0.5), q: new Quaternion().setFromUnitVectors(Z, d.clone().normalize()), len: d.length() }
  }, [b])
  return (
    <mesh position={mid} quaternion={q} userData={{ interiorPart: 'rail' }}>
      <boxGeometry args={[b.t, b.t, len]} />
      <Surface kind="trim" style={style} color={b.color} />
    </mesh>
  )
}

/** A spiral tread: a ring sector extruded down from its top. */
function WedgeMesh({ w, style }: { readonly w: Wedge3; readonly style: DisplayStyle }) {
  const geo = useMemo(() => {
    const sh = new Shape()
    sh.moveTo(w.rp * Math.cos(w.a0), w.rp * Math.sin(w.a0))
    sh.lineTo(w.r * Math.cos(w.a0), w.r * Math.sin(w.a0))
    sh.absarc(0, 0, w.r, w.a0, w.a1, false)
    sh.lineTo(w.rp * Math.cos(w.a1), w.rp * Math.sin(w.a1))
    sh.absarc(0, 0, w.rp, w.a1, w.a0, true)
    const g = new ExtrudeGeometry(sh, { depth: w.th, bevelEnabled: false, curveSegments: 6 })
    // the shape's (x, y) onto the plan's (x, z), extruded downward from the top
    g.rotateX(Math.PI / 2)
    g.translate(0, w.top, 0)
    return g
  }, [w])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <mesh geometry={geo} castShadow receiveShadow userData={{ interiorPart: 'stair' }}>
      <Surface kind="trim" style={style} color={w.color} />
    </mesh>
  )
}

function SlabMesh({ slab, style }: { readonly slab: Slab; readonly style: DisplayStyle }) {
  const geo = useMemo<BufferGeometry>(() => {
    const sh = new Shape()
    slab.pts.forEach(([x, z], i) => (i ? sh.lineTo(x, z) : sh.moveTo(x, z)))
    sh.closePath()
    const g = new ExtrudeGeometry(sh, { depth: slab.depth, bevelEnabled: false })
    g.rotateX(Math.PI / 2)
    g.translate(0, slab.top, 0)
    return g
  }, [slab])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <mesh geometry={geo} castShadow receiveShadow userData={{ interiorPart: 'slab' }}>
      <Surface kind="trim" style={style} color="#e8e2d6" />
    </mesh>
  )
}
