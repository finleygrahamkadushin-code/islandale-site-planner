import { area } from '../../interiors/geom'
import { CIRCULATION, TYPE_LABELS } from '../../interiors/types'
import { formatArch, formatArea } from './format'
import type { SheetTable } from './table'
import type { SheetBuilding, SheetFloor, SheetInteriorOpening } from './types'

/**
 * The Rooms and Interior openings tables: each room's size and area inside
 * its walls, as the plan writes them, with the floor's totals; and every
 * door, window, slider and cased opening in the partitions.
 */

const NONE = '—'
const KIND: Readonly<Record<SheetInteriorOpening['kind'], string>> = { door: 'door', window: 'window', slider: 'slider', open: 'cased opening' }
const circulation = new Set(CIRCULATION.map((t) => TYPE_LABELS[t]))
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((100 * part) / whole)}%` : NONE)

function floorRows(f: SheetFloor, floorCol: readonly string[]): string[][] {
  const rooms = f.rooms.map((r) => [
    ...floorCol,
    r.name,
    r.type,
    r.net.length ? `${formatArch(r.widthFt)} × ${formatArch(r.depthFt)}` : NONE,
    r.net.length ? formatArea(r.netAreaSqFt) : NONE,
    formatArea(area(r.outline)),
  ])
  const inside = f.rooms.filter((r) => !r.porch)
  const net = inside.reduce((s, r) => s + r.netAreaSqFt, 0)
  const drawn = inside.reduce((s, r) => s + area(r.outline), 0)
  const porches = f.rooms.filter((r) => r.porch)
  const circ = inside.filter((r) => circulation.has(r.type)).reduce((s, r) => s + r.netAreaSqFt, 0)
  const total = (label: string, kind: string, netSqFt: number, drawnSqFt: number) => [...floorCol, label, kind, NONE, formatArea(netSqFt), formatArea(drawnSqFt)]
  return [
    ...rooms,
    ...(inside.length ? [total(`All ${inside.length} room${inside.length === 1 ? '' : 's'}`, 'total', net, drawn)] : []),
    ...(circ > 0 ? [total('Circulation', `${pct(circ, net)} of the rooms`, circ, inside.filter((r) => circulation.has(r.type)).reduce((s, r) => s + area(r.outline), 0))] : []),
    ...(porches.length ? [total('Porch rooms', 'total', porches.reduce((s, r) => s + r.netAreaSqFt, 0), porches.reduce((s, r) => s + area(r.outline), 0))] : []),
  ]
}

function roomsTable(b: SheetBuilding, floors: readonly SheetFloor[]): SheetTable {
  const many = b.floors.length > 1
  return {
    title: 'Rooms',
    note:
      "From the interior plan. Size: the room inside its walls (to the partitions' faces and the walls' inside face), square to its longest side; Area: its floor inside them, as the plan writes it. Drawn area: to the partitions' centre lines and the walls' outside face, as the interior editor gives it. Circulation: halls, entries and stairs.",
    columns: [...(many ? ['Floor'] : []), 'Room', 'Type', 'Size', 'Area', 'Drawn area'],
    rows: floors.flatMap((f) => floorRows(f, many ? [f.name] : [])),
  }
}

function openingsTable(b: SheetBuilding, floors: readonly SheetFloor[]): SheetTable {
  const many = b.floors.length > 1
  return {
    title: 'Interior openings',
    note: "Doors, windows, sliders and cased openings in the partitions, from the interior plan; a door swings into the room named. One marked 'not cut' lies in a part's wall where it runs across another part's floor: the 3D model builds that wall solid there, so the plan shows the wall.",
    columns: [...(many ? ['Floor'] : []), 'Opening', 'Width', 'Between', 'Swings into'],
    rows: floors.flatMap((f) =>
      f.openings.map((o) => [
        ...(many ? [f.name] : []),
        o.inPartWall ? `${KIND[o.kind]}, not cut` : KIND[o.kind],
        formatArch(o.widthFt),
        o.to ? `${o.room} and ${o.to}` : o.room,
        o.swingsInto ?? NONE,
      ]),
    ),
  }
}

/** The building's room tables; none when it has no rooms drawn in. */
export function roomTables(b: SheetBuilding): SheetTable[] {
  const floors = b.floors.filter((f) => f.rooms.length)
  if (!floors.length) return []
  const openings = openingsTable(b, floors)
  return [roomsTable(b, floors), ...(openings.rows.length ? [openings] : [])]
}
