/**
 * Drawing sheets: floor plans and elevations of each building at a true
 * architectural scale (1/4" = 1'-0" by default), plus a table of every
 * measurement, for drawing the design by hand.
 *
 * Frames. Everything here is in the BUILDING frame, in FEET: x to the
 * building's right, z toward its front (+z is south at rotation 0), the
 * frame `massBuildingPoly` returns. A plan sheet draws x right and z down,
 * so building-frame feet are SVG user units directly. Elevations use a
 * horizontal `u` (feet, left to right as seen from outside) and a vertical
 * `y` (feet above the main floor; NAVD88 is given alongside).
 */
import type { LocalPoint } from '../../buildings/footprint'
import type { MassKind } from '../../buildings/masses'
import type { OpeningKind } from '../../buildings/openingLayout'

/** Paper inches per foot of building: 1/4" = 1'-0" is 0.25. */
export type Scale = 0.125 | 0.25 | 0.5
export const SCALE_LABEL: Readonly<Record<Scale, string>> = { 0.125: '1/8" = 1\'-0"', 0.25: '1/4" = 1\'-0"', 0.5: '1/2" = 1\'-0"' }

export type PaperId = 'letter' | 'tabloid' | 'archC' | 'archD'
/** Landscape sheet sizes, inches. */
export const PAPERS: Readonly<Record<PaperId, { readonly label: string; readonly w: number; readonly h: number }>> = {
  letter: { label: 'Letter 11 × 8.5 in', w: 11, h: 8.5 },
  tabloid: { label: 'Tabloid 17 × 11 in', w: 17, h: 11 },
  archC: { label: 'Arch C 24 × 18 in', w: 24, h: 18 },
  archD: { label: 'Arch D 36 × 24 in', w: 36, h: 24 },
}
/** Printer margin all round, and the title strip along the bottom, inches. */
export const MARGIN_IN = 0.5
export const TITLE_IN = 0.9

/** One straight edge of a part's outline, building frame. */
export interface SheetEdge {
  /** Index in the part's own outline (edge i runs from vertex i to i+1). */
  readonly index: number
  readonly a: LocalPoint
  readonly b: LocalPoint
  readonly lengthFt: number
  /** "back", "right", "edge 5" … as the part inspector names it. */
  readonly name: string
  /** Index into the part's `arcs` when this edge is one chord of an arc. */
  readonly arc: number | null
  /** On a curve: a chord of an arc, or of a curved footprint between its arcs; such edges are not dimensioned one by one. */
  readonly curved: boolean
  /** The wall's thickness, from the outline (its outside face) inward; 0 on a part with no walls. */
  readonly thicknessFt: number
  /** A glass curtain wall: one thin glazed skin, drawn without hatching. */
  readonly glass: boolean
}

/** A run of short, evenly turning edges read as one circular arc: the whole of a circle, or one arc of a compound curve. */
export interface SheetArc {
  /** First and last edge index of the run (inclusive). */
  readonly fromEdge: number
  readonly toEdge: number
  readonly centre: LocalPoint
  readonly radiusFt: number
  /** Turn of the arc in degrees, always positive. */
  readonly sweepDeg: number
  /** Length along the curve (the sum of the chords; on an ellipse's four-centre arc, the arc swung between the points where it meets the next). */
  readonly lengthFt: number
  /** Straight distance between its ends. */
  readonly chordFt: number
  /** Worst distance of any of its vertices from the circle, feet. */
  readonly fitErrorFt: number
  /** The wall's inside face round the same centre (radius less the thickness on a convex curve, more on a hollow one); null on a part with no walls. */
  readonly innerRadiusFt: number | null
}

/** An arc as fitted to an outline, before the walls' inside face is known. */
export type FittedArc = Omit<SheetArc, 'innerRadiusFt'>

/** One straight run of an opening on one edge of its part, building frame. */
export interface SheetOpeningPiece {
  /** Index of the edge in the part's outline. */
  readonly edge: number
  /** Ends on the wall line: a toward the edge's vertex a (the right end seen from outside), b toward its vertex b. */
  readonly a: LocalPoint
  readonly b: LocalPoint
  /** From the edge's left end as seen from outside (its vertex b) to this piece's left end. */
  readonly fromLeftFt: number
  /** Where the hole's sides at a and b meet the wall's inside face: the jambs run a → innerA and b → innerB (square across, or to a mitred corner near one). Equal to a and b on a part with no walls. */
  readonly innerA: LocalPoint
  readonly innerB: LocalPoint
  /** The piece's ends at mid-wall, half the thickness in, square across, where the 3D glass and door leaves stand. */
  readonly midA: LocalPoint
  readonly midB: LocalPoint
}

export interface SheetOpening {
  /** "D1", "W3": doors and sliders D, windows W, cut-outs C, numbered per building. */
  readonly tag: string
  readonly kind: OpeningKind
  /** Wall label, "Main · front 3", "Main · front 3, turning onto right 2", or "Main · curved wall" on a curve. */
  readonly wall: string
  /** Plan position of the opening's two ends on the wall line, building frame: a is its right end seen from outside. */
  readonly a: LocalPoint
  readonly b: LocalPoint
  /** The opening's straight runs, one per edge it crosses, in outline order (right to left seen from outside). */
  readonly pieces: readonly SheetOpeningPiece[]
  /** Index into the part's `arcs` when every piece lies on that one arc. */
  readonly arc: number | null
  /** Some piece lies on a curved edge, so straight dimensions cannot locate it. */
  readonly onCurve: boolean
  /** Width along the wall (round the wall where it turns or curves). */
  readonly widthFt: number
  /**
   * From the wall's left end as seen from outside to the opening's left
   * end; for an opening that turns a corner, on the last wall it turns
   * onto, where its left end is. Null on a curve, where `aroundFt` locates
   * it.
   */
  readonly fromLeftFt: number | null
  /**
   * Round the part's outline from its P1, in the P1 → P2 direction, to the
   * opening's first end (its right end seen from outside): for every
   * opening that runs round the walls and every opening on a part with a
   * curve. Null otherwise.
   */
  readonly aroundFt: number | null
  readonly sillFt: number
  readonly headFt: number
}

export interface SheetStair {
  readonly kind: 'stair' | 'ramp'
  readonly risers: number
  readonly riserIn: number
  readonly treadIn: number
  readonly widthFt: number
  readonly runFt: number
  readonly dropFt: number
  /** Ramp slope as 1:n (n = run / drop); null for stairs. */
  readonly slopeOneIn: number | null
  readonly ok: boolean
  /** Nosing lines across the stair, building frame, top first. */
  readonly nosings: readonly (readonly [LocalPoint, LocalPoint])[]
  /** Centre line from the top of the stair or ramp to its foot, building frame, for the DN arrow. */
  readonly run: readonly [LocalPoint, LocalPoint]
}

/**
 * Roof linework on the plan, building frame: ridges, hips, valleys and a
 * gambrel's breaks where the 3D roof's faces meet; on a sculpted roof its
 * contours, ribs and crown (as the 3D roof draws them), and a shell's high
 * open lip along its eave.
 */
export type SheetRoofLineKind = 'ridge' | 'hip' | 'valley' | 'break' | 'contour' | 'rib' | 'crown' | 'lip'

export interface SheetRoofLine {
  readonly kind: SheetRoofLineKind
  readonly pts: readonly LocalPoint[]
}

/** A named height of the roof ("ridge", "low eave", "lip, top" …), above this part's wall top (its eave line), feet; below it is negative. */
export interface SheetRoofLevel {
  readonly label: string
  readonly riseFt: number
}

export interface SheetRoof {
  /** Normalised roof type ("gable", "prow" …); "none" has no roof. */
  readonly type: string
  readonly pitch: number
  /** Its slopes as drawn: "7:12", both of a gambrel's ("14.98:12 / 5.82:12"), "flat", "curved"; "…, nominal" where the faceted roof's facets differ. */
  readonly slopes: string
  /** The roof finish (glass, copper, metal, sod), or null for the standard one. */
  readonly finish: string | null
  readonly overhangFt: number
  /** Eave outline, building frame (the outline grown by the overhang, or roofPts). */
  readonly eave: readonly LocalPoint[]
  /** Height of the roof's highest point above this part's eave, feet. */
  readonly riseFt: number
  /** Its named heights, low to high, the eave line (0) first where it has one. */
  readonly levels: readonly SheetRoofLevel[]
  readonly lines: readonly SheetRoofLine[]
  /** On a roof of one sloping plane (a shed): an arrow down the slope, from its high side to its low side, building frame. */
  readonly slope: { readonly high: LocalPoint; readonly low: LocalPoint } | null
  /** The column under a prow shell's tip: where it stands, its diameter at the foot, and its top above the wall top, feet. */
  readonly tip: { readonly at: LocalPoint; readonly diameterFt: number; readonly topFt: number } | null
}

/** A footprint whose outline is a curve: the shapes the app draws as many short chords. */
export type CurveKind = 'ellipse' | 'kidney' | 'teardrop' | 'blob' | 'ribbon'

/** A point the plan labels and the corner table lists: a corner P (numbered by outline vertex) or a station S on a curve. */
export interface SheetPoint {
  /** "P1", "P13" (vertex 12), or "S4", stations numbered round each part. */
  readonly label: string
  readonly at: LocalPoint
  /** Round the outline from P1, in the P1 → P2 direction, feet. */
  readonly aroundFt: number
  /** Outline vertex index of a corner; null for a station. */
  readonly vertex: number | null
}

/** An ellipse part exactly, building frame. */
export interface SheetEllipse {
  readonly centre: LocalPoint
  /** Full axes along the part's own x (width) and z (depth). */
  readonly widthFt: number
  readonly depthFt: number
  /** Turn of the width axis, degrees counter-clockwise on the plan (the part's rotation). */
  readonly rotDeg: number
  /** How far the four-centre arcs the part's `arcs` give come from its outline; null when they are not used (a circle, or too far out). */
  readonly fourCentreErrorFt: number | null
}

export interface SheetPart {
  readonly massIndex: number
  readonly name: string
  readonly kind: MassKind
  /** Width and depth of the drawn outline along the part's own axes (a rect's are the inspector's fields; a curve's are what it draws). */
  readonly wFt: number
  readonly dFt: number
  /** Offset of the part's centre from the main walls' centre, and its turn. */
  readonly dxFt: number
  readonly dzFt: number
  readonly rotDeg: number
  /** Floor of the part above the main floor. */
  readonly levelFt: number
  /** Wall or post height above the part's floor (0 for stairs, ramps and decks). */
  readonly wallFt: number
  /** Outline, building frame, as drawn in 3D: on walls, their outside face, which every dimension is to. */
  readonly outline: readonly LocalPoint[]
  /** The walls' inside face, vertex for vertex with the outline (the 3D shell's mitred corners); empty on a part with no walls. */
  readonly inner: readonly LocalPoint[]
  readonly perimeterFt: number
  readonly areaSqFt: number
  readonly edges: readonly SheetEdge[]
  readonly arcs: readonly SheetArc[]
  readonly openings: readonly SheetOpening[]
  readonly stair: SheetStair | null
  readonly roof: SheetRoof | null
  /** Curved sitting steps on a deck: each band's outline pieces, building frame, top band first. */
  readonly stepBands: readonly (readonly (readonly LocalPoint[])[])[]
  /** The curved footprint the part is, or null for a shape of straight sides (which may still have fitted arcs). */
  readonly curve: CurveKind | null
  readonly ellipse: SheetEllipse | null
  /** Its corners (on a curve, only the ends of arcs and real corners) and, on curves, stations every STATION_FT round from P1, in order round the outline. */
  readonly points: readonly SheetPoint[]
}

export interface SheetLevels {
  /** NAVD88 feet of the main floor. */
  readonly floorNavdFt: number
  /** Lowest and highest grade under the building's outline, feet relative to the main floor. */
  readonly gradeLowFt: number
  readonly gradeHighFt: number
  /** Highest point of any roof, feet relative to the main floor. */
  readonly topFt: number
}

export interface SheetBounds {
  readonly minx: number
  readonly maxx: number
  readonly minz: number
  readonly maxz: number
}

/** Everything the sheets draw for one building, worked out from the plan alone. */
export interface SheetBuilding {
  readonly id: string
  readonly name: string
  readonly type: string
  /** Building rotation as stored, degrees counter-clockwise; north on the plan sheet is drawn from it. */
  readonly rotationDeg: number
  readonly parts: readonly SheetPart[]
  /** Bounds of every outline, eaves and steps included, building frame. */
  readonly bounds: SheetBounds
  /** Bounds of the parts' outlines alone (walls, decks, porches, stairs): the building's overall size. */
  readonly outlineBounds: SheetBounds
  /** The datum the coordinate tables measure from: the back-left corner (least x, least z) of the main walls' outline (part 0) or, when no wall passes through it, of their bounding box. */
  readonly datum: LocalPoint
  /** Whether the datum is a corner of the main walls; when it is not, the plan draws their bounding box. */
  readonly datumOnWall: boolean
  /** Bounds of the main walls' outline (part 0). */
  readonly mainBounds: SheetBounds
  readonly levels: SheetLevels
  readonly totalAreaSqFt: { readonly enclosed: number; readonly decks: number }
}

export type ElevationSide = 'front' | 'right' | 'back' | 'left'

/** One elevation view of a building, from outside, looking at the given side. */
export interface ElevationView {
  readonly side: ElevationSide
  /** Horizontal extent along the view, feet, left to right as seen. */
  readonly uMin: number
  readonly uMax: number
  /** Grade along the nearest face, as (u, y) feet relative to the main floor. */
  readonly grade: readonly (readonly [number, number])[]
  /** Labelled levels (Floor, Deck 3 floor, Eave, Ridge …) in feet relative to the main floor, sorted low to high, de-duplicated within 1 in. */
  readonly levels: readonly { readonly label: string; readonly yFt: number }[]
  /** Parts seen in this view with their horizontal extent, for the width chain. */
  readonly spans: readonly { readonly name: string; readonly u0: number; readonly u1: number }[]
}

/** A rendered elevation image from the live 3D scene, white model with black edges. */
export interface ElevationImage {
  readonly side: ElevationSide
  readonly dataUrl: string
  /** The orthographic window the image shows: horizontal u and vertical y in feet, same frames as ElevationView. */
  readonly uMin: number
  readonly uMax: number
  readonly yMin: number
  readonly yMax: number
}

/** Request to the scene for one elevation image. */
export interface ElevationRequest {
  readonly objectId: string
  readonly side: ElevationSide
  /** Image pixels per foot of building. */
  readonly pxPerFt: number
  /** Main floor NAVD88 metres, so the image's y can be expressed relative to it. */
  readonly floorM: number
}

/** A rectangle of the drawing printed on one page, feet in the drawing's own frame. */
export interface Tile {
  readonly row: number
  readonly col: number
  /** "A1", "A2", "B1" … rows are letters, columns numbers. */
  readonly label: string
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}
