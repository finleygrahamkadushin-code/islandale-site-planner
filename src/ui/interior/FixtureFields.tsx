import { applyPreset, CURBS, DRAINS, fixtureNotes, heightOf, presetOf, presetsFor, resetToStandard, SHOWER_DOORS, showerOpts, withShowerOption, type ShowerOptions } from '../../interiors/fixtures'
import { FURNITURE } from '../../interiors/furniture'
import type { Furniture, FurnitureBase } from '../../interiors/types'
import { FeetInchesField } from '../FeetInchesField'

const FIXTURES = new Set(['shower', 'tub', 'vanity', 'toilet'])
const LABELS: Readonly<Record<string, string>> = { curbed: 'Curbed', curbless: 'Curbless', centre: 'Centre', linear: 'Linear', none: 'None', screen: 'Glass screen', sliding: 'Sliding glass' }

/** Size presets, height, shower options, Reset to standard and the ICC A117.1 notes for a bathroom fixture. */
export function FixtureFields({ it, roomName, accessible, disabled, set }: { readonly it: Furniture; readonly roomName: string; readonly accessible: boolean; readonly disabled: boolean; readonly set: (next: Partial<FurnitureBase>) => void }) {
  const presets = presetsFor(it.type)
  const notes = fixtureNotes(it, accessible, roomName)
  const opts = it.type === 'shower' ? showerOpts(it) : null
  const option = <K extends keyof ShowerOptions>(key: K, value: ShowerOptions[K]) => set({ fx: withShowerOption(it, { [key]: value }).fx })
  return (
    <>
      {presets.length > 0 && (
        <label className="field">
          <span>Size</span>
          <select value={presetOf(it)?.key ?? ''} disabled={disabled} onChange={(e) => e.target.value && set(applyPreset(it, e.target.value))}>
            <option value="">Custom</option>
            {presets.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <FeetInchesField label="Height" value={heightOf(it)} min={0.1} max={12} disabled={disabled} onCommit={(h) => set({ h })} />
      {opts && (
        <>
          {(['curb', 'drain', 'door'] as const).map((key) => (
            <label key={key} className="field">
              <span>{key === 'curb' ? 'Curb' : key === 'drain' ? 'Drain' : 'Door'}</span>
              <select value={opts[key]} disabled={disabled} onChange={(e) => option(key, e.target.value as never)}>
                {(key === 'curb' ? CURBS : key === 'drain' ? DRAINS : SHOWER_DOORS).map((v) => (
                  <option key={v} value={v}>
                    {LABELS[v]}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="row">
            <span>Fold-down bench</span>
            <input type="checkbox" checked={opts.bench} disabled={disabled} onChange={(e) => option('bench', e.target.checked)} />
          </label>
        </>
      )}
      {(FIXTURES.has(it.type) || FURNITURE[it.type]) && (
        <button disabled={disabled} onClick={() => set(resetToStandard(it))}>
          Reset to standard
        </button>
      )}
      {notes.map((n, i) => (
        <p key={i} className={`small fixture-note ${n.ok === true ? 'ok' : n.ok === false ? 'bad' : 'muted'}`}>
          {n.text}
        </p>
      ))}
    </>
  )
}
