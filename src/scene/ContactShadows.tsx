import { useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { BufferAttribute, BufferGeometry } from 'three'
import { usePlanStore } from '../store/planStore'
import type { PlanObject } from '../store/types'
import { useEarthworks } from '../site/earthworks/useEarthworks'
import type { Ground } from '../site/earthworks/earthworksTypes'
import { useLiveDrag } from './editing'
import { castsContactShadow, shadowMesh, shadowOutlines, type ShadowMesh } from './contactShadow'

// one mesh per object, kept while the object and the ground are unchanged
const cache = new WeakMap<PlanObject, { ground: Ground; mesh: ShadowMesh }>()

function meshFor(o: PlanObject, ground: Ground): ShadowMesh {
  const hit = cache.get(o)
  if (hit && hit.ground === ground) return hit.mesh
  const mesh = shadowMesh(shadowOutlines(o), ground)
  cache.set(o, { ground, mesh })
  return mesh
}

function merge(meshes: readonly ShadowMesh[]): BufferGeometry {
  const g = new BufferGeometry()
  const verts = meshes.reduce((s, m) => s + m.positions.length / 3, 0)
  const positions = new Float32Array(verts * 3)
  const colors = new Float32Array(verts * 4)
  const indices: number[] = []
  let base = 0
  for (const m of meshes) {
    positions.set(m.positions, base * 3)
    colors.set(m.colors, base * 4)
    for (const i of m.indices) indices.push(i + base)
    base += m.positions.length / 3
  }
  g.setAttribute('position', new BufferAttribute(positions, 3))
  g.setAttribute('color', new BufferAttribute(colors, 4))
  g.setIndex(indices)
  return g
}

/**
 * Contact shadows under every building (4E), in every display style. Built
 * only when the plan or the ground changes; a dragged object's shadow is left
 * out until it's let go, so nothing is rebuilt while something moves.
 */
export function ContactShadows() {
  const { drawnGround } = useEarthworks()
  const objects = usePlanStore(useShallow((s) => s.plan.order.map((id) => s.plan.objects[id]).filter((o) => o && castsContactShadow(o))))
  // the dragged ids change only when a drag starts or ends, not on every move
  const dragged = useLiveDrag(useShallow((s) => (s.drag ? [s.drag.id, ...(s.drag.group ?? [])] : [])))
  const geometry = useMemo(
    () => merge(objects.filter((o) => !dragged.includes(o.id)).map((o) => meshFor(o, drawnGround))),
    [objects, drawnGround, dragged],
  )
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} renderOrder={1} name="contact-shadows" raycast={() => null}>
      <meshBasicMaterial color="#000000" vertexColors transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} toneMapped={false} />
    </mesh>
  )
}
