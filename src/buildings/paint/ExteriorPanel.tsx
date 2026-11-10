import { useMemo } from 'react'
import { Tip } from '../../guide/Tip'
import { ColourInput } from '../../ui/ColourInput'
import {
  applyPreset,
  BRUSH_FIELDS,
  BRUSH_OPTIONS,
  DECK_PARTS,
  EXT_PARTS,
  EXT_PRESETS,
  EXT_SCOPES,
  extOverrides,
  extResolve,
  paintExt,
  PART_LABELS,
  resetExt,
  type ExtHost,
  type ExtPart,
  type ExtPatch,
  type ExtScope,
} from './exterior'
import { buildingMasses, deckObjectMass, edgeName, massPoly, partName } from '../masses'
import { elementLabel, paintPartOf } from './paintPick'
import { CURVED_SHAPES } from '../footprint'
import { isObjectLocked, usePlanStore } from '../../store/planStore'
import type { PaintFocus } from '../../store/paintTypes'

type Params = Record<string, unknown>

const SCOPE_LABELS: Readonly<Record<ExtScope, string>> = { element: 'This element', mass: 'This mass', house: 'Whole house' }
const KIND_LABEL = (k: string) => (k === '' ? 'painted' : k)
const MAT_LABEL = (k: string) => (k === '' ? 'standard' : k)
const HINT = 'Pick an element in Paint mode (P) or with the selects, choose how far the change reaches, then set its material and colour. Presets apply to the chosen scope. Rail style is visual only; the code check still treats the rail as required.'

/**
 * The Exterior panel (legacy ext-panel) for the selected building or deck:
 * the element in focus (picked in Paint mode or with the selects), how far
 * a change reaches, its material, finish, rail style and colour, the
 * presets, and every override with a reset. Each change is one undo step,
 * refused on a lock.
 */
export function ExteriorPanel({ id }: { readonly id: string }) {
  const o = usePlanStore((s) => s.plan.objects[id])
  const locked = usePlanStore((s) => isObjectLocked(s, id))
  const painting = usePlanStore((s) => s.painting)
  const stored = usePlanStore((s) => s.paintFocus)
  const scope = usePlanStore((s) => s.paintScope)
  const { setPainting, setPaintFocus, setPaintScope, editExterior, showToast } = usePlanStore.getState()
  const host: ExtHost = o?.type === 'deck' ? 'deck' : 'building'
  const masses = useMemo(() => (!o ? [] : host === 'deck' ? [deckObjectMass(o.params)] : buildingMasses(o.params)), [o, host])
  if (!o || (o.type !== 'house' && o.type !== 'deck')) return null

  const parts: readonly ExtPart[] = host === 'deck' ? DECK_PARTS : EXT_PARTS.filter((p) => p !== 'slab')
  const kept = stored?.objectId === id && masses[stored.mass] ? stored : null
  // a wall that is no longer there (the shape changed, or an undo) falls back to all the mass's walls
  const focus: PaintFocus = !kept
    ? { objectId: id, part: host === 'deck' ? 'deck' : 'wall', mass: 0, edge: null }
    : kept.edge !== null && kept.edge >= massPoly(masses[kept.mass]).length
      ? { ...kept, edge: null }
      : kept
  const focusKey = `${focus.part}|${focus.mass}|${focus.edge}`
  const part = (paintPartOf(focus.part) ?? 'wall') as ExtPart
  const m = masses[focus.mass]
  // a curved mass is one unrolled wall, as the old Walls editor and ext.walls keys have it
  const curved = (CURVED_SHAPES as readonly string[]).includes(m.shape)
  const edges = part === 'wall' && host === 'building' ? (curved ? 1 : massPoly(m).length) : 0
  const look = extResolve(o.params, focus.mass, part, focus.edge, host)
  const rows = extOverrides(o.params, host)
  const fields = BRUSH_FIELDS[part]
  const effScope: ExtScope = scope === 'element' && part === 'wall' && focus.edge === null ? 'mass' : scope

  const change = (f: (p: Params) => Params) => {
    try {
      editExterior(id, f)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'That paint could not be applied')
    }
  }
  const write = (patch: ExtPatch) => change((p) => paintExt(p, { scope: effScope, part, mi: host === 'deck' ? 0 : focus.mass, edge: focus.edge, fields: patch }))
  const refocus = (patch: Partial<PaintFocus>) => setPaintFocus({ ...focus, ...patch })

  return (
    <div className="exterior" data-testid="ext-panel">
      <div className="row between">
        <span className="muted small">
          Element <b data-testid="ext-target">{elementLabel(host === 'deck' ? o.name || 'Deck' : partName(m, focus.mass), part, curved ? null : focus.edge)}</b>
        </span>
        <Tip label="Click walls, roofs, rails… in 3D to pick them" keyHint="P">
          <button type="button" className={painting ? 'on' : ''} data-testid="paint-mode" onClick={() => setPainting(!painting)}>
            Paint mode
          </button>
        </Tip>
      </div>
      <div className="grid2">
        {host === 'building' && (
          <label className="field">
            <span className="muted small">Mass</span>
            <select value={focus.mass} data-testid="ext-mass" onChange={(e) => refocus({ mass: Number(e.target.value), edge: null })}>
              {masses.map((mm, i) => (
                <option key={i} value={i}>
                  {partName(mm, i)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span className="muted small">Part</span>
          <select value={part} data-testid="ext-part" onChange={(e) => refocus({ part: e.target.value, edge: null })}>
            {parts.map((p) => (
              <option key={p} value={p}>
                {PART_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        {edges > 0 && (
          <label className="field">
            <span className="muted small">Wall</span>
            <select value={focus.edge ?? ''} data-testid="ext-wall" onChange={(e) => refocus({ edge: e.target.value === '' ? null : Number(e.target.value) })}>
              <option value="">all walls</option>
              {Array.from({ length: edges }, (_, i) => (
                <option key={i} value={i}>
                  {curved ? 'curved wall' : edgeName(m, i)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="ext-chips" role="group" aria-label="Apply to">
        {EXT_SCOPES.map((sc) => (
          <button key={sc} type="button" className={`small ${scope === sc ? 'on' : ''}`} data-testid={`ext-scope-${sc}`} onClick={() => setPaintScope(sc)}>
            {SCOPE_LABELS[sc]}
          </button>
        ))}
      </div>
      <div className="grid2">
        {fields.includes('kind') && (
          <Choice label="Material" value={look.kind} options={BRUSH_OPTIONS.kind} name={KIND_LABEL} disabled={locked} testId="ext-kind" onChange={(v) => write({ kind: v as ExtPatch['kind'] })} />
        )}
        {fields.includes('mat') && (
          <Choice label="Roof finish" value={look.mat} options={BRUSH_OPTIONS.mat} name={MAT_LABEL} disabled={locked} testId="ext-rmat" onChange={(v) => write({ mat: v as ExtPatch['mat'] })} />
        )}
        {fields.includes('style') && (
          <Choice label="Rail style" value={look.style || 'wood'} options={BRUSH_OPTIONS.style} name={(v) => v} disabled={locked} testId="ext-rail" onChange={(v) => write({ style: v as ExtPatch['style'] })} />
        )}
        <label className="field">
          <span className="muted small">
            Colour {look.src.color && <em>({look.src.color})</em>}
          </span>
          <span className="row">
            <ColourInput key={`${look.color}|${focusKey}`} value={look.color} disabled={locked} testId="ext-color" label="Element colour" onCommit={(color) => write({ color })} />
            <Tip label="Drop this colour override">
              <button type="button" className="small" disabled={locked} aria-label="Drop this colour override" onClick={() => write({ color: null })}>
                ×
              </button>
            </Tip>
          </span>
        </label>
      </div>
      <div className="ext-chips">
        {EXT_PRESETS.filter((p) => parts.includes(p.part)).map((p) => (
          <button
            key={p.id}
            type="button"
            className="small"
            disabled={locked}
            data-testid={`ext-preset-${p.id}`}
            onClick={() => change((q) => applyPreset(q, p.id, { scope: effScope, part, mi: host === 'deck' ? 0 : focus.mass, edge: focus.edge }))}
          >
            {p.label}
          </button>
        ))}
      </div>
      <strong className="small">Overrides</strong>
      {rows.length ? (
        <ul className="ext-list">
          {rows.map((r) => (
            <li key={r.key} className="row between" data-testid="ext-row">
              <Tip label="Focus this element">
                <button type="button" className="link" onClick={() => (setPaintFocus({ objectId: id, part: r.part, mass: r.mi ?? 0, edge: r.edge }), setPaintScope(r.scope))}>
                  {r.label}
                </button>
              </Tip>
              <span className="muted small">{r.text}</span>
              <button type="button" className="small" disabled={locked} aria-label={`Remove override ${r.label}`} onClick={() => change((q) => resetExt(q, r.key))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">None: the scheme's own finishes.</p>
      )}
      <div className="actions">
        <button type="button" disabled={locked || !rows.length} data-testid="ext-reset" onClick={() => change((q) => resetExt(q))}>
          Reset exterior
        </button>
      </div>
      <p className="muted small">{HINT}</p>
    </div>
  )
}

function Choice<T extends string>({ label, value, options, name, disabled, testId, onChange }: { label: string; value: T | ''; options: readonly (T | '')[]; name: (v: string) => string; disabled: boolean; testId: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span className="muted small">{label}</span>
      <select value={value} disabled={disabled} data-testid={testId} onChange={(e) => onChange(e.target.value)}>
        {options.map((v) => (
          <option key={v} value={v}>
            {name(v)}
          </option>
        ))}
      </select>
    </label>
  )
}
