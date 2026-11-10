import { useEffect, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshBasicMaterial, type Group, type Material, type Mesh, type Object3D } from 'three'

/**
 * Draws its children as a faint ghost that can't be picked (isolate mode):
 * every mesh takes one shared see-through material, lines and points hide,
 * and nothing casts shadows or answers the pointer. The children never know;
 * turning `on` off (or unmounting) puts back what each object had.
 *
 * Children may rebuild their meshes at any time (a display style change, a
 * param edit), so the subtree is checked every few frames for meshes not yet
 * ghosted.
 */

const GHOST = new MeshBasicMaterial({ color: '#c9d1d8', transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false })
/** Check for rebuilt meshes this often, in frames. */
const RECHECK_FRAMES = 10
const noRaycast = (): void => undefined

interface Saved {
  readonly material: Material | Material[]
  readonly raycast: Object3D['raycast']
  readonly castShadow: boolean
  readonly visible: boolean
}
const saved = new WeakMap<Object3D, Saved>()

const isMesh = (o: Object3D): o is Mesh => (o as Mesh).isMesh === true
/** Lines, fat lines (drei's Edges) and points: hidden rather than re-materialled. */
const isLineLike = (o: Object3D): boolean => {
  const flags = o as unknown as Record<string, unknown>
  return flags.isLine === true || flags.isPoints === true || flags.isLineSegments2 === true || flags.isLine2 === true
}

function ghost(o: Object3D): void {
  const lineLike = isLineLike(o)
  if (!lineLike && !isMesh(o)) return
  const m = o as Mesh
  // already ghosted and not rebuilt since
  if (saved.has(o) && (lineLike ? !o.visible : m.material === GHOST)) return
  saved.set(o, { material: m.material, raycast: o.raycast, castShadow: o.castShadow, visible: o.visible })
  o.raycast = noRaycast
  o.castShadow = false
  if (lineLike) o.visible = false
  else m.material = GHOST
}

function restore(o: Object3D): void {
  const s = saved.get(o)
  if (!s) return
  saved.delete(o)
  o.raycast = s.raycast
  o.castShadow = s.castShadow
  o.visible = s.visible
  if (isMesh(o)) o.material = s.material
}

export function Ghosted({ on, children }: { readonly on: boolean; readonly children: ReactNode }) {
  const ref = useRef<Group>(null)
  const frame = useRef(0)
  useFrame(() => {
    const root = ref.current
    if (!on || !root) return
    if (frame.current++ % RECHECK_FRAMES === 0) root.traverse(ghost)
  })
  useEffect(() => {
    const root = ref.current
    if (!on || !root) return
    root.traverse(ghost)
    frame.current = 1
    return () => root.traverse(restore)
  }, [on])
  return <group ref={ref}>{children}</group>
}
