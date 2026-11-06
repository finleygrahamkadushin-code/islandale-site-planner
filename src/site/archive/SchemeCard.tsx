import { useId, useState } from "react";
import type { Scheme } from "../schemes";
import type { Site } from "../types";
import type { SchemeSummary } from "./schemeSummary";
import { SchemeThumb } from "./SchemeThumb";
import { useArchiveOpen } from "./archiveOpen";
import { openScheme } from "./openScheme";
import { PROGRAM_CAP_SQFT } from "../rules/program";

const sqft = (v: number) => Math.round(v).toLocaleString("en-US");

/** What a card says about the brief: area against the cap and the code check, or that the rules are off. */
export function briefLine(s: SchemeSummary): string {
  const area = `${sqft(s.enclosedSqFt)} of ${sqft(PROGRAM_CAP_SQFT)} sq ft`;
  if (s.rulesOff) return `${area} · rules off`;
  return `${area} · code check: ${s.checks.pass} pass, ${s.checks.fail} fail`;
}

/** One scheme in the archive (5F): plan picture, name, tag line, description, badges, how it does against the brief, Open. */
export function SchemeCard({
  summary: s,
  scheme,
  site,
  isOpen,
}: {
  readonly summary: SchemeSummary;
  readonly scheme: Scheme;
  readonly site: Site;
  readonly isOpen: boolean;
}) {
  const [more, setMore] = useState(false);
  const blurbId = useId();
  // ask over the archive, so Cancel returns to this card; the archive closes only on Open
  const open = () =>
    openScheme(s.id, () => useArchiveOpen.getState().setOpen(false));
  const hasBadges = s.rulesOff || s.overCap || s.cabinsWithoutPlan > 0;
  return (
    <article
      className={`scheme-card${isOpen ? " is-open" : ""}`}
      data-testid={`scheme-card-${s.id}`}
      aria-label={s.name}
    >
      <SchemeThumb scheme={scheme} site={site} />
      <div className="scheme-text">
        <h4>{s.name}</h4>
        <p className="scheme-tag muted small">{s.tag}</p>
        <p
          id={blurbId}
          className={`scheme-blurb small${more ? "" : " clamped"}`}
        >
          {s.blurb}
        </p>
        {s.blurb.length > 160 && (
          <button
            type="button"
            className="link small"
            aria-expanded={more}
            aria-controls={blurbId}
            onClick={() => setMore(!more)}
          >
            {more ? "Less" : "More"}
          </button>
        )}
        {hasBadges && (
          <ul className="scheme-badges" aria-label="Notes">
            {s.rulesOff && <li className="badge">Rules off</li>}
            {s.overCap && <li className="badge warn">Over 1,600 sq ft</li>}
            {s.cabinsWithoutPlan > 0 && (
              <li className="badge">
                {s.cabinsWithoutPlan}{" "}
                {s.cabinsWithoutPlan === 1 ? "cabin" : "cabins"} without a floor
                plan
              </li>
            )}
          </ul>
        )}
        <p className="scheme-brief small" data-testid="scheme-brief">
          {briefLine(s)}
        </p>
        {!s.rulesOff && s.checks.failing.length > 0 && (
          <p className="muted small">Fails: {s.checks.failing.join(", ")}.</p>
        )}
        {!s.routeChecked && (
          <p className="muted small" data-testid="route-if-rebuilt">
            Its walks aren’t path pieces yet. If rebuilt: {s.routeIfRebuilt.ok} of {s.routeIfRebuilt.of} {s.routeIfRebuilt.of === 1 ? 'cabin has' : 'cabins have'} a step-free route.
          </p>
        )}
        <div className="row">
          {isOpen ? (
            <span className="small muted" data-testid="open-now">
              Open now
            </span>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={open}
              aria-label={`Open ${s.name}`}
            >
              Open
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
