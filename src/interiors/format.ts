import { formatArch } from '../export/sheets/format'
import { snapInch } from '../ui/feetInches'

/** 12'-6" (old INT.model.fmtLen), from feet: the drawing sheets' formatter (R11), to the inch; nothing for no number. */
export const fmtLen = (ft: number): string => (Number.isFinite(ft) ? formatArch(snapInch(ft)) : '')

/** 140 sf, from square feet. */
export const fmtArea = (sf: number): string => `${Math.round(Number.isFinite(sf) ? sf : 0)} sf`
