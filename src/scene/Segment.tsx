import { Quaternion, Vector3 } from 'three'
import type { ReactNode } from 'react'

const UP = new Vector3(0, 1, 0)

/** A square bar from a to b (local metres), for rails, stringers and braces. */
export function Segment({ a, b, size, children }: { readonly a: readonly [number, number, number]; readonly b: readonly [number, number, number]; readonly size: number; readonly children: ReactNode }) {
  const va = new Vector3(...a)
  const dir = new Vector3(...b).sub(va)
  const len = dir.length()
  if (len < 1e-4) return null
  const mid = va.addScaledVector(dir, 0.5)
  const q = new Quaternion().setFromUnitVectors(UP, dir.normalize())
  return (
    <mesh position={mid} quaternion={q} castShadow>
      <boxGeometry args={[size, len, size]} />
      {children}
    </mesh>
  )
}
