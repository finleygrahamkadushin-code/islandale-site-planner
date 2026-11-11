import { useLayoutEffect, useMemo, useRef, useState, type ReactNode, type SyntheticEvent } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3, type Camera, type Group, type Object3D } from 'three'
import type { LocalPoint } from '../buildings/footprint'
import { chipElements, dropChip, newChipId, putChip } from './chipRegistry'

/** Chips past this in normalised device coordinates are hidden (legacy). */
const NDC_LIMIT = 1.05
const OFF_SCREEN = [-1e5, -1e5]

/** Stacking of the part overlay, bottom to top (legacy #handles3d): rail chips, handles, + chips, the open menu. */
export const LAYER = { rail: 10, handle: 20, plus: 30, menu: 40 } as const

const p0 = new Vector3()
const p1 = new Vector3()

/**
 * Where a chip goes on screen: the projection of its anchor, pushed
 * `px` pixels along the screen direction of `normal` (building frame, a
 * unit step in feet), or straight up when that does not project (legacy
 * rail chips at 22 px, + chips at 44 px). Off screen past ±1.05 NDC.
 */
function chipPosition(normal: LocalPoint | undefined, px: number) {
  return (el: Object3D, camera: Camera, size: { width: number; height: number }): number[] => {
    p0.setFromMatrixPosition(el.matrixWorld).project(camera)
    if (Math.abs(p0.x) > NDC_LIMIT || Math.abs(p0.y) > NDC_LIMIT || p0.z > 1) return OFF_SCREEN
    const x = ((p0.x + 1) / 2) * size.width
    const y = ((1 - p0.y) / 2) * size.height
    if (!px) return [x, y]
    let dx = 0
    let dy = -1
    if (normal) {
      p1.set(normal[0], 0, normal[1]).applyMatrix4(el.matrixWorld).project(camera)
      const sx = ((p1.x + 1) / 2) * size.width - x
      const sy = ((1 - p1.y) / 2) * size.height - y
      const L = Math.hypot(sx, sy)
      if (L > 1e-3 && p1.z <= 1) {
        dx = sx / L
        dy = sy / L
      }
    }
    return [x + dx * px, y + dy * px]
  }
}

interface Props {
  /** Anchor in the parent group's frame (metres). */
  readonly position: readonly [number, number, number]
  /** Building-frame outward direction to push the chip along on screen. */
  readonly normal?: LocalPoint
  readonly px?: number
  readonly layer: number
  readonly children: ReactNode
}

/**
 * A DOM chip pinned to a point in the scene, offset on screen like the old
 * planner's chips. The chip itself is drawn by `ChipLayer` over the canvas;
 * this places it every frame, as `LabelProjector` places labels.
 */
export function ScreenChip({ position, normal, px = 0, layer, children }: Props) {
  const nx = normal?.[0]
  const nz = normal?.[1]
  const place = useMemo(() => chipPosition(nx === undefined || nz === undefined ? undefined : [nx, nz], px), [nx, nz, px])
  const [id] = useState(newChipId)
  const anchor = useRef<Group>(null)
  useLayoutEffect(() => putChip({ id, layer, node: children }), [id, layer, children])
  useLayoutEffect(() => () => dropChip(id), [id])
  useFrame(({ camera, size }) => {
    const el = chipElements.get(id)
    if (!el || !anchor.current) return
    const [x, y] = place(anchor.current, camera, size)
    if (x === OFF_SCREEN[0]) {
      el.style.display = 'none'
      return
    }
    el.style.display = ''
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`
  })
  return <group ref={anchor} position={position as [number, number, number]} />
}

/** Keep a chip's pointer events from reaching the canvas, which would pick, select or clear behind it. */
export const stop = (e: SyntheticEvent) => e.stopPropagation()
export const STOP_EVENTS = { onPointerDown: stop, onPointerUp: stop, onClick: stop, onDoubleClick: stop } as const
