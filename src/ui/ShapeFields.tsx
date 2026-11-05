import { num } from '../buildings/footprint'
import type { Mass } from '../buildings/masses'
import { BUILDING_SHAPES, carsPatch, changes, extraField, extraPatch, PAD_SHAPES, ROOF_FINISHES, ROOF_OPTIONS, roofPatch, shapePatch, type Option } from '../buildings/parts/shapeEdits'
import { NumField } from './fields'

type Patch = Readonly<Record<string, unknown>>

interface ShapeProps {
  /** The part's own stored params (a cabin, a wing or a pad). */
  readonly p: Readonly<Record<string, unknown>>
  readonly pad: boolean
  /** A parking pad: show the Cars drawn field. */
  readonly cars?: boolean
  readonly disabled: boolean
  /** Apply one patch as one undo step. */
  readonly set: (patch: Patch) => void
}

/** Footprint shape and its one extra field (taper, skew, bend or point), legacy sh-shape/sh-taper and pd-shape/pd-taper. */
export function ShapeFields({ p, pad, cars = false, disabled, set }: ShapeProps) {
  const shape = typeof p.shape === 'string' ? p.shape : 'rect'
  const extra = extraField(shape)
  const w = num(p.w, 10)
  const put = (patch: Patch) => changes(p, patch) && set(patch)
  return (
    <div className="grid2" data-testid="shape-fields">
      <Select label="Footprint" value={shape} options={pad ? PAD_SHAPES : BUILDING_SHAPES} disabled={disabled} onChange={(v) => put(shapePatch(v, pad))} testId="shape-select" />
      {extra && (
        <NumField
          label={extra.label}
          unit={extra.unit}
          value={num(p[extra.key], extra.fallback(w))}
          min={extra.min}
          step={extra.step}
          digits={2}
          disabled={disabled}
          onCommit={(v) => put(extraPatch(shape, Math.min(extra.max, v)))}
          onClear={() => put(extraPatch(shape, null))}
        />
      )}
      {cars && <NumField label="Cars drawn" unit="" value={num(p.cars, 0)} min={0} disabled={disabled} onCommit={(v) => put(carsPatch(v))} />}
    </div>
  )
}

/** Roof type, ridge, overhang, pitch, finish and shell curl (legacy sh-roof … sh-curl). */
export function RoofFields({ m, disabled, set }: { readonly m: Mass; readonly disabled: boolean; readonly set: (patch: Patch) => void }) {
  const put = (key: Parameters<typeof roofPatch>[0], raw: string) => {
    const patch = roofPatch(key, raw)
    const cur: Patch = { roof: m.roof, ridge: m.ridge, overhang: m.overhang, pitch: m.pitch, roofMat: m.roofMat, curl: m.curl }
    if (changes(cur, patch)) set(patch)
  }
  const curled = m.roof === 'shell' || m.roof === 'vault'
  return (
    <div className="grid2" data-testid="roof-fields">
      <Select label="Roof" value={m.roof} options={ROOF_OPTIONS.map((r) => ({ value: r, label: r }))} disabled={disabled} onChange={(v) => put('roof', v)} testId="roof-select" />
      {m.roof !== 'none' && (
        <>
          <Select label="Ridge runs" value={m.ridge} options={[{ value: 'x', label: 'Along width' }, { value: 'z', label: 'Along depth' }]} disabled={disabled} onChange={(v) => put('ridge', v)} />
          <NumField label="Pitch" unit=":12" value={m.pitch} min={1} disabled={disabled} onCommit={(v) => put('pitch', String(v))} />
          <NumField label="Overhang" unit="ft" value={m.overhang} min={0} disabled={disabled} onCommit={(v) => put('overhang', String(v))} />
          <Select label="Finish" value={m.roofMat ?? ''} options={ROOF_FINISHES} disabled={disabled} onChange={(v) => put('roofMat', v)} testId="roof-finish" />
          {curled && <NumField label="Shell curl" unit="0–1" value={m.curl ?? 0.5} min={0} step={0.05} digits={2} disabled={disabled} onCommit={(v) => put('curl', String(v))} onClear={() => put('curl', '')} />}
        </>
      )}
    </div>
  )
}

function Select({ label, value, options, disabled, onChange, testId }: { label: string; value: string; options: readonly Option[]; disabled: boolean; onChange: (v: string) => void; testId?: string }) {
  return (
    <label className="field">
      <span className="muted small">{label}</span>
      <select value={value} disabled={disabled} data-testid={testId} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
