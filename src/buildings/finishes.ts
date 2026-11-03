import type { TextureName } from '../scene/Surface'

/**
 * Roof and wall finishes as the old planner draws them (roofFinish,
 * specWallMat, wallTex): the default colour and the surface texture of each.
 * Pure data, shared by the roof and wall meshes and the Exterior panel.
 */

export type RoofFinish = 'glass' | 'copper' | 'metal' | 'sod'
export const ROOF_FINISH_LIST: readonly RoofFinish[] = ['glass', 'copper', 'metal', 'sod']

/** Default colour of a roof finish when the roof has none of its own (legacy roofFinish). */
export const ROOF_FINISH_COLOUR: Readonly<Record<Exclude<RoofFinish, 'glass'>, string>> = {
  copper: '#6aa28c',
  metal: '#8d949a',
  sod: '#5f803d',
}

/** Texture of a roof finish; glass is drawn as see-through glass instead (Surface kind clearGlass). */
export const ROOF_FINISH_TEXTURE: Readonly<Record<Exclude<RoofFinish, 'glass'>, TextureName>> = {
  copper: 'copper',
  metal: 'metal',
  sod: 'sod',
}

export type WallKind = 'glass' | 'cedar' | 'board' | 'timber' | 'stone'
export const WALL_KIND_LIST: readonly WallKind[] = ['glass', 'cedar', 'board', 'timber', 'stone']

/** Default wall colour of a kind when the wall has none (legacy specWallMat). */
export const wallKindColour = (kind: WallKind): string => (kind === 'stone' ? '#a39d92' : '#9b6b43')

/** Texture of a solid wall kind; glass is a curtain wall (Surface kind clearGlass plus mullions). */
export const WALL_KIND_TEXTURE: Readonly<Record<Exclude<WallKind, 'glass'>, TextureName>> = {
  cedar: 'cedar',
  board: 'board',
  timber: 'timber',
  stone: 'stone',
}

export const isRoofFinish = (v: unknown): v is RoofFinish => typeof v === 'string' && (ROOF_FINISH_LIST as readonly string[]).includes(v)
export const isWallKind = (v: unknown): v is WallKind => typeof v === 'string' && (WALL_KIND_LIST as readonly string[]).includes(v)
