"""Regenerate the Gathering prow in scheme C: curved prow on the west side, sharp prow on the east, a deck that wraps both,
and a fan of curved steps off the curved run. Geometry in ft, main-mass local (+z = front, toward Mud Bay)."""
import json, math, pathlib, subprocess

HTML = pathlib.Path(__file__).resolve().parent.parent / "index.html"
R_HOUSE, CX, CZ = 8.67, -5.33, 4.33          # west corner arc: tangent to the west wall and the front wall
DECK_W = 8.0                                   # deck depth, same as the side porch
STEP_FROM, STEP_TO = 90.0, 120.0               # curved steps on this stretch of the deck's outer arc (deg; 90 = front)

def arc(cx, cz, r, a0, a1, step):
    n = max(1, math.ceil(abs(a1 - a0) / step))
    return [[round(cx + r * math.cos(math.radians(a0 + (a1 - a0) * k / n)), 2),
             round(cz + r * math.sin(math.radians(a0 + (a1 - a0) * k / n)), 2)] for k in range(n + 1)]

def area(P):
    return sum(P[i][0] * P[(i + 1) % len(P)][1] - P[(i + 1) % len(P)][0] * P[i][1] for i in range(len(P))) / 2

house_arc = arc(CX, CZ, R_HOUSE, 90, 180, 7.5)             # (-5.33,13) -> (-14,4.33)
house = [[-14, -13], [14, -13], [14, 4.33], [7, 13]] + house_arc   # edges: 0 back, 1 east, 2 east prow, 3 front, 4..15 arc, 16 west
assert area(house) > 0

# east prow face (14,4.33)->(7,13) pushed out by the deck depth, meeting the deck front at z = 13 + DECK_W
dx, dz = 7 - 14, 13 - 4.33; L = math.hypot(dx, dz); ux, uz = dx / L, dz / L; nx, nz = uz, -ux
E = [round(14 + nx * DECK_W, 2), round(4.33 + nz * DECK_W, 2)]
Bp = [7 + nx * DECK_W, 13 + nz * DECK_W]; s = (13 + DECK_W - Bp[1]) / uz
F = [round(Bp[0] + ux * s, 2), 13 + DECK_W]
outer = arc(CX, CZ, R_HOUSE + DECK_W, 90, 180, 7.5)        # (-5.33,21) -> (-22,4.33)
deck = [E, F] + outer + list(reversed(house_arc)) + [[7, 13], [14, 4.33]]
assert area(deck) > 0, "deck must run counter-clockwise like every footprint"
step_edges = [i for i in range(len(deck)) if 2 <= i < 2 + len(outer) - 1
              and STEP_FROM <= 90 + 7.5 * (i - 2) + 3.75 <= STEP_TO]
xs = [p[0] for p in deck]; zs = [p[1] for p in deck]
dcx, dcz = round((min(xs) + max(xs)) / 2, 2), round((min(zs) + max(zs)) / 2, 2)
deck_wing = {"kind": "deck", "open": True, "shape": "poly", "dx": dcx, "dz": dcz, "rot": 0,
             "w": round(max(xs) - min(xs), 1), "d": round(max(zs) - min(zs), 1), "h": 1,
             "pts": [[round(x - dcx, 2), round(z - dcz, 2)] for x, z in deck],
             "steps": {"e0": step_edges[0], "e1": step_edges[-1]},
             "roof": "none", "pitch": 0, "ridge": "x", "overhang": 0}

def prow_line(text):
    start = text.index('   {"t":"house","name":"Gathering prow"'); return start, text.index("\n", start)
src = HTML.read_text(); start, end = prow_line(src)
orig = subprocess.run(["git", "show", "0fdabcd:index.html"], cwd=HTML.parent, capture_output=True, text=True, check=True).stdout
o0, o1 = prow_line(orig); g = json.loads(orig[o0:o1].strip().rstrip(","))   # always rebuild from the imported original
g.update(shape="poly", pts=house, roof="prow")
entry_porch, entry_stair, _old_deck, _old_stair, side_porch = g["wings"]
side_porch.update(dz=round((-8 + CZ) / 2, 3), d=round(8 + CZ, 2))       # now ends where the curved deck begins
g["wings"] = [entry_porch, entry_stair, deck_wing, side_porch]

# exterior openings: the front wall is shorter, the old west prow window becomes a curved window, the west wall is edge 16
front_len = math.hypot(7 - house_arc[0][0], 0)
perim = lambda n: sum(math.hypot(house[(i + 1) % len(house)][0] - house[i][0], house[(i + 1) % len(house)][1] - house[i][1]) for i in range(n))
for c in g["cuts"]:
    if c["edge"] == 3: c["x"] = round(front_len - 2 - c["w"], 2)
    elif c["edge"] == 5: c["edge"] = 16
    elif c["edge"] == 4:
        arc_len = perim(16) - perim(4); c.pop("edge"); c.update(along=True, w=8, h=5, sill=2.5, x=round(perim(4) + (arc_len - 8) / 2, 2))

# floor plan: the lounge follows the curve; its old west window becomes four narrow windows on the curve
fl = g["floors"][0]; room_arc = arc(CX, CZ, R_HOUSE, 90, 180, 15)
lounge = next(r for r in fl["rooms"] if r["id"] == 5553)
lounge["pts"] = [[-14, 4.33], [14, 4.33], [7, 13]] + room_arc[:-1]     # edges: 0 hall side, 1 east prow, 2 front, 3..8 curve
ops = [o for o in fl["openings"] if o["id"] != 5571]
for o in ops:
    if o["id"] == 5565: o["pos"] = round(7 / front_len, 3)
ops += [{"id": 5590 + k, "room": 5553, "edge": 4 + k, "pos": 0.5, "width": 1.75, "kind": "window", "flip": False, "out": False} for k in range(4)]
fl["openings"] = ops

new = "   " + json.dumps(g, ensure_ascii=False, separators=(",", ":")) + ","
src = src[:start] + new + src[end:]

# the beach path now starts at the foot of the curved steps (world metres, measured in the planner) instead of the old straight stair
OLD_PATH = '{"t":"pad","name":"Path to beach","w":47.6,"d":4,"h":0.2,"color":"#b8a888","lift":0,"rot":-52.964,"x":7.85,"n":-12.5}'
NEW_PATH = '{"t":"pad","name":"Path to beach","w":43.3,"d":4,"h":0.2,"color":"#b8a888","lift":0,"rot":-35.232,"x":6.83,"n":-14.485}'
src = src.replace(OLD_PATH, NEW_PATH)
OLD_BLURB = "lounge in the prow, hearth between; firepit and beach path beyond."
NEW_BLURB = ("lounge in the prow, hearth between. The prow is curved on the west, where the lounge wall and the roof sweep round toward the "
             "firepit, and sharp on the east. One deck wraps it from the side porch round the curve and across the front to the angled east "
             "side; off the front of the curve a fan of curved steps follows the deck edge down to the beach path, with handrails at both ends.")
src = src.replace(OLD_BLURB, NEW_BLURB)
HTML.write_text(src)
print("house edges", len(house), "deck edges", len(deck), "steps", deck_wing["steps"], "E", E, "F", F, "deck centre", dcx, dcz)
