import { useMemo } from 'react'
import { Edges } from '@react-three/drei'
import type { Texture } from 'three'
import type { DisplayStyle } from '../store/types'
import {
  battenSiding,
  concrete,
  deckBoards,
  grass,
  gravel,
  lapSiding,
  perFoot,
  perMetre,
  shakeRoof,
  shingleSiding,
  standingSeam,
  type TileTexture,
} from './textures'

/** What a surface is made of; each display style decides how that looks. */
export type SurfaceKind = 'wall' | 'roof' | 'trim' | 'glass' | 'frame' | 'door' | 'concrete' | 'wood' | 'pad' | 'canopy' | 'trunk' | 'deck'

export type TextureName = 'batten' | 'lap' | 'shingle' | 'seam' | 'shake' | 'sod' | 'gravel' | 'deck' | 'concrete'

const SOURCES: Readonly<Record<TextureName, () => TileTexture>> = {
  batten: battenSiding,
  lap: lapSiding,
  shingle: shingleSiding,
  seam: standingSeam,
  shake: shakeRoof,
  sod: grass,
  gravel,
  deck: deckBoards,
  concrete,
}

const scaled = new Map<string, Texture>()
/** Shared texture copies, one per name and unit, so every cabin reuses the same GPU texture. */
export function textureFor(name: TextureName, unit: 'ft' | 'm'): Texture {
  const key = `${name}:${unit}`
  const hit = scaled.get(key)
  if (hit) return hit
  const t = unit === 'ft' ? perFoot(SOURCES[name]()) : perMetre(SOURCES[name]())
  scaled.set(key, t)
  return t
}

const WHITE = '#f3f2ee'
const SKETCH_LINE = '#2a2a2a'

interface SurfaceProps {
  readonly kind: SurfaceKind
  readonly style: DisplayStyle
  readonly color?: string
  /** Realistic-mode texture, multiplied by `color`. */
  readonly texture?: TextureName
  readonly textureUnit?: 'ft' | 'm'
  /** Flat colour for the Diagram style. */
  readonly diagramColor?: string
  /** 0..1 selection or hover highlight. */
  readonly glow?: number
  /** Realistic only: tint by the geometry's vertex colours (tree crowns). */
  readonly vertexColors?: boolean
  /** Pull the surface toward the camera in the depth test, for things laid on a wall face (openings). */
  readonly layer?: number
}

/** The material (and, in Sketch, the edge lines) for one mesh. Use as a mesh child. */
export function Surface({ kind, style, color, texture, textureUnit = 'ft', diagramColor, glow = 0, vertexColors = false, layer = 0 }: SurfaceProps) {
  const lift = layer ? { polygonOffset: true, polygonOffsetFactor: -layer, polygonOffsetUnits: -layer } : {}
  const map = useMemo(() => (style === 'realistic' && texture ? textureFor(texture, textureUnit) : null), [style, texture, textureUnit])
  const emissive = glow > 0 ? '#ffffff' : '#000000'
  const emissiveIntensity = glow * 0.22

  if (kind === 'glass') {
    if (style === 'realistic') {
      return <meshPhysicalMaterial {...lift} color="#1d2a30" roughness={0.04} metalness={0} clearcoat={1} clearcoatRoughness={0.03} envMapIntensity={2.4} reflectivity={0.9} />
    }
    return (
      <>
        <meshStandardMaterial {...lift} color={style === 'diagram' ? '#9fb6c2' : '#c9d2d6'} roughness={0.3} />
        {style === 'sketch' && <Edges color={SKETCH_LINE} />}
      </>
    )
  }

  if (style === 'realistic') {
    const base = vertexColors ? '#ffffff' : realisticColour(kind, color)
    const rough = kind === 'roof' ? (texture === 'seam' ? 0.45 : 0.95) : kind === 'frame' ? 0.6 : 0.9
    const metal = kind === 'roof' && texture === 'seam' ? 0.35 : 0
    return <meshStandardMaterial {...lift} color={base} map={map} roughness={rough} metalness={metal} emissive={emissive} emissiveIntensity={emissiveIntensity} vertexColors={vertexColors} />
  }
  if (style === 'diagram') {
    return <meshLambertMaterial {...lift} color={diagramColour(kind, diagramColor)} emissive={emissive} emissiveIntensity={emissiveIntensity} />
  }
  const tone = kind === 'frame' || kind === 'door' ? '#e1e0db' : kind === 'canopy' ? '#ecebe6' : WHITE
  return (
    <>
      <meshStandardMaterial {...lift} color={tone} roughness={1} metalness={0} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      {style === 'sketch' && kind !== 'canopy' && kind !== 'trunk' && <Edges color={SKETCH_LINE} threshold={20} />}
    </>
  )
}

function realisticColour(kind: SurfaceKind, color?: string): string {
  switch (kind) {
    case 'frame':
      return '#2d3033'
    case 'door':
      return '#5a4332'
    case 'concrete':
      return '#9d9a93'
    case 'wood':
      return '#6e5236'
    case 'trunk':
      return color ?? '#5b4433'
    case 'deck':
      // legacy deck boards, #c9ad84
      return color ?? '#c9ad84'
    default:
      return color ?? '#b8b0a0'
  }
}

function diagramColour(kind: SurfaceKind, diagram?: string): string {
  if (kind === 'wall' || kind === 'roof' || kind === 'trim' || kind === 'door' || kind === 'frame') return diagram ?? '#c9b48a'
  if (kind === 'canopy') return '#9cc08a'
  if (kind === 'trunk') return '#8b7766'
  if (kind === 'pad' || kind === 'deck') return '#d9d4c7'
  return '#bdbab2'
}

/** Diagram palette: one flat colour per cabin, stable for its id. */
const PALETTE = ['#e07a5f', '#3d85c6', '#81b29a', '#f2cc8f', '#9c6ade', '#e06c9f', '#5fb3b3', '#c9a227']
export function diagramColourFor(id: string): string {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}
