"""Regenerate the Gathering prow in scheme C and its three prow variants (C2 traditional, C3 twin prow, C4 shell).

Every variant: the cabin is sunk 4 ft into the slope (earthworks cut), one deck wraps the prow and runs under the side porch
(the porch is only a roof over it), a fan of deep curved steps flows down toward the madrone and round its trunk, and the
elders reach the side porch on a sweeping 1:21 boardwalk instead of the old level boardwalk to the entry porch.
Geometry in ft, main-mass local (+z = front, toward Mud Bay) unless noted. Rebuilds from the imported original each run:
    python3 tools/gathering_prow.py"""
import json, math, pathlib, subprocess

HTML = pathlib.Path(__file__).resolve().parent.parent / "index.html"
ORIGINAL = "0fdabcd"
R_HOUSE, CX, CZ = 8.67, -5.33, 4.33          # west corner arc: tangent to the west wall and the front wall
DECK_W = 8.0                                   # deck depth, same as the side porch
EAST_PROW_X = 4.7                              # front corner of the sharp east prow; keeps scheme C under 1,600 sq ft
STEP_FROM, STEP_TO = 125.0, 165.0              # curved steps on this stretch of the outer arc (deg), facing the madrone
STEP_TREAD = 2.25                              # ft: deep garden treads; the flight ends just past the madrone
SINK = 4                                       # ft the cabin is set into the slope
PORCH_Z0 = -8                                  # back end of the side porch / deck under it

# the elders' walk, laid out in the planner: world metres + deck elevation in ft (elders' floor 27.49 -> side porch 23.69)
ELDERS_WALK = [[-9.555, 2.715, 27.49], [-8.991, 0.836, 27.18], [-10.064, -2.148, 26.68], [-13.223, -4.546, 26.06],
               [-15.357, -7.343, 25.5], [-13.796, -9.04, 25.12], [-11.202, -6.368, 24.52], [-8.911, -3.796, 23.98],
               [-7.255, -2.972, 23.69]]
# the beach path starts at the foot of the steps, past the madrone (world metres, measured in the planner)
OLD_PATH = '{"t":"pad","name":"Path to beach","w":47.6,"d":4,"h":0.2,"color":"#b8a888","lift":0,"rot":-52.964,"x":7.85,"n":-12.5}'
NEW_PATH = '{"t":"pad","name":"Path to beach","w":66.2,"d":4,"h":0.2,"color":"#b8a888","lift":0,"rot":-13.276,"x":2.396,"n":-15.973}'

def arc(cx, cz, r, a0, a1, step):
    n = max(1, math.ceil(abs(a1 - a0) / step))
    return [[round(cx + r * math.cos(math.radians(a0 + (a1 - a0) * k / n)), 2),
             round(cz + r * math.sin(math.radians(a0 + (a1 - a0) * k / n)), 2)] for k in range(n + 1)]

def area(P):
    return sum(P[i][0] * P[(i + 1) % len(P)][1] - P[(i + 1) % len(P)][0] * P[i][1] for i in range(len(P))) / 2

def offset_face(a, b, dist):
    """Push the wall face a->b out by dist (outward = right of travel on a CCW outline); returns both pushed points and the face direction."""
    dx, dz = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dz); nx, nz = dz / L, -dx / L
    return [a[0] + nx * dist, a[1] + nz * dist], [b[0] + nx * dist, b[1] + nz * dist], (dx / L, dz / L)

def on_line_at(p, u, z=None, x=None):
    s = (z - p[1]) / u[1] if z is not None else (x - p[0]) / u[0]
    return [round(p[0] + u[0] * s, 2), round(p[1] + u[1] * s, 2)]

def wing_from(pts, **kw):
    xs = [p[0] for p in pts]; zs = [p[1] for p in pts]
    cx, cz = round((min(xs) + max(xs)) / 2, 2), round((min(zs) + max(zs)) / 2, 2)
    w = {"dx": cx, "dz": cz, "rot": 0, "w": round(max(xs) - min(xs), 1), "d": round(max(zs) - min(zs), 1), "shape": "poly",
         "pts": [[round(x - cx, 2), round(z - cz, 2)] for x, z in pts]}
    w.update(kw); return w

def deck_wing(pts, step_edges):
    assert area(pts) > 0, "deck must run counter-clockwise like every footprint"
    return wing_from(pts, kind="deck", open=True, h=1, steps={"e0": step_edges[0], "e1": step_edges[-1], "tread": STEP_TREAD},
                     roof="none", pitch=0, ridge="x", overhang=0)

# ---------- the curved/sharp prow (scheme C, C3, C4) ----------
house_arc = arc(CX, CZ, R_HOUSE, 90, 180, 7.5)                       # (-5.33,13) -> (-14,4.33)
house = [[-14, -13], [14, -13], [14, 4.33], [EAST_PROW_X, 13]] + house_arc   # edges 0 back, 1 east, 2 east prow, 3 front, 4..15 arc, 16 west
assert area(house) > 0
E, Bp, u = offset_face([14, 4.33], [EAST_PROW_X, 13], DECK_W)
F = on_line_at(Bp, u, z=13 + DECK_W); E = [round(v, 2) for v in E]
outer = arc(CX, CZ, R_HOUSE + DECK_W, 90, 180, 7.5)                 # (-5.33,21) -> (-22,4.33)
curved_deck = [E, F] + outer + [[-22, PORCH_Z0], [-14, PORCH_Z0]] + list(reversed(house_arc)) + [[EAST_PROW_X, 13], [14, 4.33]]
curved_steps = [2 + k for k in range(len(outer) - 1) if STEP_FROM <= 90 + 7.5 * k + 3.75 <= STEP_TO]

# ---------- the traditional symmetric prow (C2): both prow faces angled, the deck mirrors them ----------
Ee, Be, ue = offset_face([14, 4.33], [7, 13], DECK_W)
Wa, Wb, uw = offset_face([-7, 13], [-14, 4.33], DECK_W)
trad_deck = [[round(v, 2) for v in Ee], on_line_at(Be, ue, z=13 + DECK_W), on_line_at(Wa, uw, z=13 + DECK_W), on_line_at(Wa, uw, x=-22),
             [-22, PORCH_Z0], [-14, PORCH_Z0], [-14, 4.33], [-7, 13], [7, 13], [14, 4.33]]
trad_steps = [2]                                                       # the angled west edge faces the madrone

# ---------- shell roof outline (C4): the eaves grown by the overhang, pulled out over the deck to a tip ----------
def grow(P, k):
    n = len(P); out = []
    def nrm(p, q):
        dx, dz = q[0] - p[0], q[1] - p[1]; L = math.hypot(dx, dz); return dz / L, -dx / L
    for i in range(n):
        a, b, c = P[i - 1], P[i], P[(i + 1) % n]
        n1, n2 = nrm(a, b), nrm(b, c); mx, mz = n1[0] + n2[0], n1[1] + n2[1]; ml = math.hypot(mx, mz)
        cos = max(0.5, (mx * n2[0] + mz * n2[1]) / ml); out.append([b[0] + mx / ml * k / cos, b[1] + mz / ml * k / cos])
    return out

def hull(pts):
    pts = sorted(map(tuple, pts)); cross = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], p) <= 0: hi.pop()
        hi.append(p)
    return [[round(x, 2), round(z, 2)] for x, z in lo[:-1] + hi[:-1]]

SHELL_TIP = [1.5, 21.0]
shell_roof = hull(grow(house, 2.5) + [SHELL_TIP])

# ---------- variants ----------
def line_of(text, name):
    start = text.index('   {"t":"house","name":"' + name + '"'); return start, text.index("\n", start)

def base(g):
    g = json.loads(json.dumps(g))
    g["earth"] = {"sink": SINK}
    entry_porch, entry_stair, _old_deck, _old_stair, side_porch = g["wings"]
    side_porch.update(dz=round((PORCH_Z0 + CZ) / 2, 3), d=round(CZ - PORCH_Z0, 2), slab=False)   # only a roof: the deck is its floor
    return g, entry_porch, entry_stair, side_porch

def curved(g):
    g, entry_porch, entry_stair, side_porch = base(g)
    g.update(shape="poly", pts=house, roof="prow")
    g["wings"] = [entry_porch, entry_stair, deck_wing(curved_deck, curved_steps), side_porch]
    front_len = EAST_PROW_X - house_arc[0][0]
    perim = lambda n: sum(math.hypot(house[(i + 1) % len(house)][0] - house[i][0], house[(i + 1) % len(house)][1] - house[i][1]) for i in range(n))
    for c in g["cuts"]:
        if c["edge"] == 3: c["w"] = 8; c["x"] = round((front_len - c["w"]) / 2, 2)
        elif c["edge"] == 5: c["edge"] = 16
        elif c["edge"] == 4:
            arc_len = perim(16) - perim(4); c.pop("edge"); c.update(along=True, w=8, h=5, sill=2.5, x=round(perim(4) + (arc_len - 8) / 2, 2))
    fl = g["floors"][0]; room_arc = arc(CX, CZ, R_HOUSE, 90, 180, 15)
    next(r for r in fl["rooms"] if r["id"] == 5553)["pts"] = [[-14, 4.33], [14, 4.33], [EAST_PROW_X, 13]] + room_arc[:-1]
    ops = [o for o in fl["openings"] if o["id"] != 5571]
    for o in ops:
        if o["id"] == 5565: o.update(pos=round(EAST_PROW_X / front_len, 3), width=8)
    ops += [{"id": 5590 + k, "room": 5553, "edge": 4 + k, "pos": 0.5, "width": 1.75, "kind": "window", "flip": False, "out": False} for k in range(4)]
    fl["openings"] = ops
    return g

def traditional(g):
    g, entry_porch, entry_stair, side_porch = base(g)
    g["wings"] = [entry_porch, entry_stair, deck_wing(trad_deck, trad_steps), side_porch]
    return g

def twin(g):
    g = curved(g)
    porch = wing_from([[-6, -13], [-6, -17], [-2.5, -21], [2.5, -21], [6, -17], [6, -13]], kind="porch", open=True, h=9,
                      roof="prow", gable="front", pitch=7, ridge="z", overhang=1)
    stair = dict(g["wings"][1]); stair.update(dz=-23.5)
    g["wings"] = [porch, stair] + g["wings"][2:]
    return g

def shell(g):
    g = curved(g)
    g.update(roofPts=shell_roof, vault=True, roofDip=4.5)
    return g

def dump(g):
    return json.dumps(g, ensure_ascii=False, separators=(",", ":"))

orig = subprocess.run(["git", "show", ORIGINAL + ":index.html"], cwd=HTML.parent, capture_output=True, text=True, check=True).stdout
a, b = line_of(orig, "Gathering prow"); G0 = json.loads(orig[a:b].strip().rstrip(","))
a, b = line_of(orig, "Elders’ wedge"); EL = json.loads(orig[a:b].strip().rstrip(","))

src = HTML.read_text()
a, b = line_of(src, "Gathering prow"); src = src[:a] + "   " + dump(curved(G0)) + "," + src[b:]
el = json.loads(json.dumps(EL)); el["wings"] = [w for i, w in enumerate(el["wings"]) if i != 2]   # drop the old level boardwalk to the entry porch
a, b = line_of(src, "Elders’ wedge"); src = src[:a] + "   " + dump(el) + "," + src[b:]
WALK_NAME = "Elders’ walk · 1:21 boardwalk"
walk_c = [round((min(q[k] for q in ELDERS_WALK) + max(q[k] for q in ELDERS_WALK)) / 2, 4) for k in (0, 1)]   # a bridge's x,n is the centre of its points' bounding box
walk = ('{"t":"bridge","name":"' + WALK_NAME + '","style":"ribbon","w":5,"d":81,"h":1,"color":"#a98c62","pts":'
        + json.dumps(ELDERS_WALK) + ',"x":%s,"n":%s},\n   ' % (walk_c[0], walk_c[1]))
if WALK_NAME in src:
    a = src.index('{"t":"bridge","name":"' + WALK_NAME); b = src.index("},", a) + 2; src = src[:a] + walk.rstrip().rstrip(",").rstrip("\n   ").rstrip(",") + "," + src[b:]
else:
    marker = '{"t":"pad","name":"Driveway · west notch","w":24,"d":12,"h":0.2,"color":"#8c8c86","lift":0,"rot":40,"x":-23.5,"n":6,"shape":"para","skew":-6},'
    i = src.index(marker, src.index('"name":"Elders’ wedge"')); src = src[:i] + walk + src[i:]

for known in (OLD_PATH, '{"t":"pad","name":"Path to beach","w":43.3,"d":4,"h":0.2,"color":"#b8a888","lift":0,"rot":-35.232,"x":6.83,"n":-14.485}'):
    src = src.replace(known, NEW_PATH)

a = src.index("lounge in the prow, hearth between."); b = src.index("1,5", a)
src = src[:a] + ("lounge in the prow, hearth between. The cabin is set 4 ft into the slope. Its prow is curved on the west, where the lounge "
                 "wall and the roof sweep round toward the madrone, and sharp on the east. One deck runs under the side porch and wraps the prow; "
                 "off the curve a fan of deep garden steps flows down to the madrone and round its trunk. The elders reach the side porch on their own "
                 "sweeping boardwalk, a 1:21 slope with no steps. ") + src[b:]

VARIANTS = [
    ("C2 · Traditional prow", "scheme C with a symmetric prow · gable roof · angled deck both sides",
     "Scheme C with the classic prow: both seaward faces angled under a gable roof, and the deck mirrors them on both sides. The deep garden steps come off the angled west side and part round the madrone. Same sinking, side porch and elders' boardwalk as C.",
     traditional),
    ("C3 · Twin prow", "scheme C with a second prow on the lane side · pointed entry porch",
     "Scheme C with a second prow: the entry porch on the lane side is pointed too, under a hipped prow roof with its gable against the house, so the cabin reads as a boat with a bow at each end. Everything else as C.",
     twin),
    ("C4 · Shell prow", "scheme C with the roof reaching over the deck · vaulted ceiling · tip on one column",
     "Scheme C with a shell roof: the prow roof reaches out over the deck to a point near its front edge, dipping toward the tip on a single slim column, so the seaward deck is covered. Inside there is no flat ceiling: it follows the cone and hips of the roof, with a band of clerestory glass between the wall tops and the vault. Everything else as C.",
     shell),
]
START, END = "// ==== scheme C prow variants (tools/gathering_prow.py) ====", "// ==== /scheme C prow variants ====\n"
lines = [START, "(function prowVariants(){ try{ const i=SCHEMES.findIndex(s=>/^C · Prow/.test(s.name)); if(i<0) return; const C=SCHEMES[i]; const V=[];"]
for name, tag, blurb, fn in VARIANTS:
    lines.append("  V.push({name:%s,tag:%s,blurb:%s,objects:C.objects.map(o=>/^Gathering prow/.test(o.name)?%s:o)});"
                 % (json.dumps(name, ensure_ascii=False), json.dumps(tag, ensure_ascii=False), json.dumps(blurb, ensure_ascii=False), dump(fn(G0))))
lines.append("  SCHEMES.splice(i+1,0,...V); }catch(e){ console.error('[prow variants]',e); } })();")
block = "\n".join(lines) + "\n" + END
if START in src:
    a = src.index(START); b = src.index(END, a) + len(END); src = src[:a] + block + src[b:]
else:
    a = src.index("// ==== scheme-d.js ===="); src = src[:a] + block + src[a:]
HTML.write_text(src)
print("curved steps", curved_steps, "| trad deck", trad_deck, "| shell roof pts", len(shell_roof))
