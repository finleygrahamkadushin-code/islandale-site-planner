import { DEFAULT_SETBACKS, STRICT_SHORE_FT } from '../../store/types'
import { HANDRAIL_RISERS } from './codeCheckRails'
import { HEIGHT_LIMIT_FT } from './height'
import { NARROW_ALLOWED_FT, NARROW_LOT_FT, WIDTH_SHARE } from './lotWidth'
import { BUILDING_CAP_SQFT, PROGRAM_CAP_SQFT } from './program'
import { TREE_ZONE_1_FT, TREE_ZONE_2_FT } from './setbacks'

/**
 * Where each limit the site rules check against comes from (review R2.7,
 * R2.8). A limit with a `source` names the code section it is read from; one
 * without is "assumed": the old planner's figure, or the brief's, not
 * checked against the county text (which could not be fetched during the
 * review). Shown in the Code check panel and printed on the site sheet,
 * with the plain note that the check is a planning aid, not a code review.
 */

/** One line on the Tabloid sheet's notes column (about 100 characters at most), so it never pushes the notes onto a page of their own. */
export const PLANNING_AID_NOTE = 'A planning aid, not a code review: the county limits here are assumed. Confirm them with the county.'

/**
 * What the accessible-route check (ADA 2010 §402–405, `paths/route/`) does not
 * test, printed beside the note above (R2.10, Finley's decision: say so, don't
 * build them yet). One sheet line too.
 */
export const ROUTE_UNCHECKED_NOTE = 'Accessible route: ramp landing width, edge protection, passing spaces and door clearance are not checked.'

export const ASSUMED = 'assumed'

export interface RuleLimit {
  readonly id: string
  readonly label: string
  readonly value: string
  /** The code section it is read from, or null when the number is assumed. */
  readonly source: string | null
}

const n = (v: number) => v.toLocaleString('en-US')

export const RULE_LIMITS: readonly RuleLimit[] = [
  { id: 'shore', label: 'Shoreline setback', value: `${DEFAULT_SETBACKS.shoreFt} ft, ${STRICT_SHORE_FT} ft strict`, source: null },
  { id: 'bank', label: 'Top of bank', value: `${DEFAULT_SETBACKS.bankFt} ft in from the east shore`, source: null },
  { id: 'side', label: 'Side and rear setback', value: `${DEFAULT_SETBACKS.sideFt} ft`, source: null },
  { id: 'buffer-30in', label: 'Structures allowed in the buffer', value: 'under 30 in', source: null },
  { id: 'height', label: 'Height', value: `${HEIGHT_LIMIT_FT} ft above average grade`, source: null },
  { id: 'lot-width', label: 'Lot width', value: `${Math.round(WIDTH_SHARE * 100)} %, ${NARROW_ALLOWED_FT} ft under ${NARROW_LOT_FT} ft`, source: null },
  { id: 'tree-zones', label: 'Tree zones', value: `${TREE_ZONE_1_FT} ft and ${TREE_ZONE_2_FT} ft from the water`, source: null },
  { id: 'program', label: 'Enclosed area', value: `${n(BUILDING_CAP_SQFT)} sq ft a building, ${n(PROGRAM_CAP_SQFT)} sq ft in all`, source: null },
  { id: 'guards', label: 'Guards', value: '36 in where a floor is over 30 in up, openings under 4 in', source: 'IRC R312.1' },
  { id: 'stair-handrail', label: 'Stair handrails', value: `${HANDRAIL_RISERS} or more risers`, source: 'IRC R311.7.8' },
  { id: 'ramp-handrail', label: 'Ramp handrails', value: 'rise over 6 in', source: 'ADA 405.8' },
]

/** One limit as the panel and the sheet write it: "Height 35 ft above average grade (assumed)". */
export const limitText = (l: RuleLimit): string => `${l.label} ${l.value} (${l.source ?? ASSUMED})`
