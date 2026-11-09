"""The check-in B contact sheet: contact.html beside materials.json, one row per texture set, every picture 2 x 2 tiles,
with where it's used, its relief, bake time, seam numbers (green or red) and warnings, then the seam report table."""
from __future__ import annotations

import html
from pathlib import Path

COLUMNS = (("BC", "Base colour"), ("ORM", "ORM (AO · rough · metal)"), ("H", "Height"), ("N", "Normal"),
           ("lit", "Lit, light from top left"))

CSS = """
:root{--bg:#f6f5f2;--fg:#1d1d1b;--muted:#6b6a66;--ok:#1f7a3a;--bad:#b3261e;--card:#fff;--line:#e2e0da}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--fg:#ecebe7;--muted:#a3a19b;--ok:#5fc27e;--bad:#ff8a80;
--card:#1f1f1d;--line:#33322f}}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:14px/1.45 -apple-system,system-ui,sans-serif}
h1{font-size:22px;margin:0 0 4px}p.sub{color:var(--muted);margin:0 0 20px}
.set{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;margin:0 0 16px}
.head{display:flex;flex-wrap:wrap;gap:6px 16px;align-items:baseline;margin-bottom:10px}
.head b{font-size:16px}.muted{color:var(--muted)}.ok{color:var(--ok)}.bad{color:var(--bad);font-weight:600}
.row{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
figure{margin:0}figure img{width:100%;display:block;border-radius:4px;image-rendering:auto}
figcaption{font-size:12px;color:var(--muted);margin-top:3px}
ul.warn{margin:8px 0 0;padding-left:18px;color:var(--bad)}
table{border-collapse:collapse;width:100%;font-size:12px;background:var(--card)}
th,td{border:1px solid var(--line);padding:4px 6px;text-align:right}th:first-child,td:first-child{text-align:left}
@media (max-width:760px){.row{grid-template-columns:repeat(2,minmax(0,1fr))}}
"""


def _status(m: dict) -> str:
    return m.get("status") or ("pass" if m.get("pass") else "fail")


def _seam_line(m: dict) -> str:
    edge = m["seams"]["edge"]
    worst = max(max(e["edge_u"], e["edge_v"]) for e in edge.values())
    parts = [f"edge worst {worst:.2f}"]
    for name, c in m["seams"]["shift"].items():
        parts.append(f"{name} shift {c['shift_mean']:.4f} line {c.get('shift_line', 0):.3f} ({c['shift_rule'] or 'FAIL'})")
    if not m["seams"].get("shift_checked", True):
        parts.append("shift check skipped")
    st = _status(m)
    return f'<span class="{"ok" if st == "pass" else "bad"}">{st.upper()}</span> · ' + html.escape(" · ".join(parts))


def _set_html(name: str, m: dict) -> str:
    figs = "".join(f'<figure><img src="{html.escape(name)}/{m["previews"][k]}" alt="{label}">'
                   f"<figcaption>{label}</figcaption></figure>" for k, label in COLUMNS)
    params = f' <span class="muted">{html.escape(str(m["params"]))}</span>' if m["params"] else ""
    warn = "".join(f"<li>{html.escape(w)}</li>" for w in m["warnings"])
    return (f'<section class="set" id="{html.escape(name)}"><div class="head"><b>{html.escape(name)}</b>{params}'
            f'<span class="muted">relief {m["relief_m"] * 100:.2f} cm · AO from {m["ao_source"]} · '
            f'{m["res"]} px · {m["bake_s"]:.0f} s</span><span>{_seam_line(m)}</span></div>'
            f'<div class="row">{figs}</div>'
            f'<p class="muted" style="margin:8px 0 0">Used by: {html.escape(", ".join(m["used_by"]))}</p>'
            f'{f"<ul class=warn>{warn}</ul>" if warn else ""}</section>')


def _report_rows(materials: dict) -> str:
    rows = []
    for name, m in materials.items():
        e = m["seams"]["edge"]
        cells = [f'{max(x["edge_u"], x["edge_v"]):.2f}' for x in e.values()]
        sh = m["seams"]["shift"]
        shifts = [f'{sh[p]["shift_mean"]:.4f} / {sh[p].get("shift_line", 0):.3f}'
                  f'{"*" if sh[p]["shift_rule"] == "noise_floor" else ""}' if p in sh else "–"
                  for p in ("color", "orm", "height")]
        st = _status(m)
        cls = "ok" if st == "pass" else "bad"
        rows.append(f'<tr><td>{html.escape(name)}</td>{"".join(f"<td>{c}</td>" for c in cells[:4])}'
                    f'{"".join(f"<td>{s}</td>" for s in shifts)}<td>{m["albedo_luminance"]["p01"]:.3f}–'
                    f'{m["albedo_luminance"]["p99"]:.3f}</td><td>{m["height"]["max"]:.2f}</td>'
                    f'<td class="{cls}">{st}</td></tr>')
    return "".join(rows)


def write(out: Path, manifest: dict) -> Path:
    mats = manifest["materials"]
    bad = manifest["failed"] + manifest.get("unchecked", []) + manifest.get("missing", [])
    status = f'<span class="ok">all {len(mats)} sets pass</span>' if not bad else (
        f'<span class="bad">failed: {html.escape(", ".join(manifest["failed"]) or "none")}; unchecked: '
        f'{html.escape(", ".join(manifest.get("unchecked", [])) or "none")}; not baked: '
        f'{html.escape(", ".join(manifest.get("missing", [])) or "none")}</span>')
    blends = "".join(f"<li><b>{html.escape(k)}</b>: {html.escape(v['lower'])} under {html.escape(v['upper'])}, "
                     f"rule {html.escape(v['rule'])}</li>" for k, v in manifest["blends"].items())
    doc = (f"<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content='width=device-width,"
           f"initial-scale=1'><title>Islandale texture bake</title><style>{CSS}</style></head><body>"
           f"<h1>Islandale texture bake for Unreal</h1><p class=sub>{len(mats)} sets · {manifest['res']} px per 6 m tile · "
           f"Blender {html.escape(manifest['blender'])} · {html.escape(manifest['generated'])} · {status}. "
           f"Every picture shows 2 × 2 tiles, so a seam would show as a line through the middle.</p>"
           + "".join(_set_html(k, m) for k, m in mats.items())
           + f"<h2>Blends (layers plus a rule, mixed in Unreal)</h2><ul>{blends}</ul>"
           "<h2>Seam report</h2><p class=muted>Edge: the step across the wrap ÷ the k-th largest step inside the tile, pass "
           "≤ 1.5. Shift (mean / line): half-tile difference at 1024 px, worst channel, pass mean &lt; 0.01 and worst "
           "row or column &lt; 0.03, or * both within 1.5 × the map's own render noise.</p>"
           "<div style='overflow-x:auto'><table><tr><th>set</th><th>BC edge</th><th>ORM edge</th><th>H edge</th>"
           "<th>N edge</th><th>colour shift</th><th>ORM shift</th><th>height shift</th><th>albedo p1–p99</th>"
           f"<th>height max</th><th></th></tr>{_report_rows(mats)}</table></div></body></html>")
    path = out / "contact.html"
    path.write_text(doc)
    return path
