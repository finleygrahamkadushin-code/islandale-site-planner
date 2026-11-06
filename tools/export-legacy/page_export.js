/* Islandale export, page side. export_scene.mjs injects this into the planner page (index.html) as a classic script, so it sees the
   planner's top-level bindings (scene, terrain, objects, masses, extResolve, ...) by name. It never edits the planner's scene: it copies
   what is drawn into a clean THREE.Scene (geometry baked into each object's frame, every mesh named and tagged, no selection helpers,
   no edge lines), runs THREE.GLTFExporter on that and returns the .glb (base64) plus the manifest's data.

   Exported tree:  Terrain (mesh) · Earthworks (group) · Water (mesh) · Objects > "<name> #<id>" > "<name> #<id>|<part>|m<mi>|e<ei>|<k>"
   Colours: glTF factors and COLOR_0 are linear, converted from the planner's sRGB hex; extras carry the sRGB hex as the planner shows it. */
(function () {
  'use strict';
  const HELPER_NAMES = new Set(['sel', 'ring', 'knob']);   // selection helpers inside each object's group
  const INTERIOR_WALL = 'partition';                        // interior walls: the planner tags them 'wall' inside its 'interior' group
  const EXT_PARTS = ['wall', 'roof', 'trim', 'deck', 'post', 'door', 'glass', 'foundation', 'rail', 'stair', 'ramp', 'slab'];
  const ROUND_M = 1e4;                                       // metres in extras and the manifest: 0.1 mm
  const GLASS_ROUGHNESS = 0.1;                               // for the planner's Phong glass / water
  const DEFAULT_ROUGHNESS = 0.86;                            // the planner's matte surfaces
  const BRIDGE_PRISMS = {                                    // specMesh: after deck, body (and glass), its prism meshes in build order
    ribbon: ['rail', 'structure', 'post', 'post'],
    truss: ['truss', 'structure', 'post', 'post'],
    cable: ['cable', 'cable', 'post', 'post'],
  };
  const SURFACE_WORDS = ['gravel', 'flagstone', 'pavers', 'paver', 'concrete', 'asphalt', 'boardwalk', 'cedar', 'stone', 'grass', 'lawn', 'mulch', 'sod'];
  const USE_WORDS = ['driveway', 'parking', 'lane', 'path', 'patio', 'walk', 'court', 'firepit', 'terrace'];
  const CAR = { body: 1.85, cabin: 1.65, wheel: 0.33 };      // m: car box widths and wheel radius in makeMesh

  const r4 = v => Math.round(v * ROUND_M) / ROUND_M;
  const hexOf = c => '#' + c.getHexString();
  const firstMat = m => (Array.isArray(m.material) ? m.material[0] : m.material);
  const nodeName = o => `${o.name} #${o.id}`;

  // ---------- settle detection: the Node side polls this until it stops changing ----------
  function signature() {
    let meshes = 0, verts = 0;
    const count = root => root.traverse(m => { if (m.isMesh) { meshes++; verts += m.geometry.attributes.position.count; } });
    count(objGroup); count(earthGroup);
    return JSON.stringify([objects.length, meshes, verts, !!earthTimer, terrainGeo.drawRange.count, exag]);
  }

  // ---------- scene choice ----------
  function loadScheme(name) {
    const rows = [...document.querySelectorAll('#schemes .scheme')];
    const title = d => d.querySelector('b').textContent.trim();
    const row = rows.find(d => title(d) === name) || rows.find(d => title(d).startsWith(name + ' ·'));
    if (!row) throw new Error(`no scheme "${name}"; schemes: ${rows.map(title).join(' | ')}`);
    row.querySelector('button').click();          // exactly what the stale-scheme banner does
    return title(row);
  }
  function loadLayoutJson(text) { loadLayout(text); return objects.length; }
  function setExag(v) { const el = $('ex'); el.value = String(v); el.dispatchEvent(new Event('input')); return exag; }

  // ---------- materials: one clean MeshStandardMaterial per look ----------
  function materialCache() {
    const cache = new Map();
    return (key, src, opts = {}) => {
      if (cache.has(key)) return cache.get(key);
      const linear = new THREE.Color(opts.vertexColors ? '#ffffff' : (src && src.color ? hexOf(src.color) : '#cccccc')).convertSRGBToLinear();
      const glassy = !!(src && (src.isMeshPhongMaterial || (src.transparent && src.opacity < 0.6)));
      const mat = new THREE.MeshStandardMaterial({
        color: linear, vertexColors: !!opts.vertexColors, metalness: 0,
        roughness: glassy ? GLASS_ROUGHNESS : (src && src.roughness != null ? src.roughness : DEFAULT_ROUGHNESS),
        transparent: !!(src && src.transparent && src.opacity < 1), opacity: src && src.transparent ? src.opacity : 1,
        side: src && src.side === THREE.DoubleSide ? THREE.DoubleSide : THREE.FrontSide,
      });
      mat.name = key;
      cache.set(key, mat);
      return mat;
    };
  }
  function materialKey(ex, src, vertexColors) {
    const variant = ex.wallKind || ex.roofMat || ex.railStyle || ex.surface || '';
    const hex = vertexColors ? 'vertex' : (src && src.color ? hexOf(src.color) : '#cccccc');
    const alpha = src && src.transparent && src.opacity < 1 ? ` a${src.opacity.toFixed(2)}` : '';
    const sides = src && src.side === THREE.DoubleSide ? ' 2s' : '';
    return `${ex.part}${variant ? '-' + variant : ''} ${hex}${alpha}${sides}`;
  }

  // ---------- geometry: copy, trim to the draw range, bake a matrix, linear vertex colours ----------
  function copyAttr(a, linearColor) {
    const out = new Float32Array(a.count * a.itemSize), get = ['getX', 'getY', 'getZ', 'getW'];
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a[get[k]](i);
    if (linearColor) for (let i = 0; i < a.count; i++) for (let k = 0; k < 3; k++) { const j = i * a.itemSize + k; out[j] = THREE.MathUtils.clamp(out[j], 0, 1) ** 2.2; }
    return new THREE.BufferAttribute(out, a.itemSize);
  }
  function drawIndex(src) {
    const dr = src.drawRange, n = src.index ? src.index.count : src.attributes.position.count;
    const start = Math.max(0, dr.start | 0), end = Math.min(n, dr.count === Infinity ? n : start + dr.count);
    if (src.index) return Array.from(src.index.array.slice(start, end));
    if (start === 0 && end === n) return null;
    return Array.from({ length: end - start }, (_, i) => start + i);
  }
  function flipWinding(g) {
    if (g.index) { const a = g.index.array; for (let i = 0; i + 2 < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } return; }
    Object.values(g.attributes).forEach(at => { const s = at.itemSize, a = at.array; for (let i = 0; i + 2 < at.count; i += 3) for (let k = 0; k < s; k++) { const t = a[(i + 1) * s + k]; a[(i + 1) * s + k] = a[(i + 2) * s + k]; a[(i + 2) * s + k] = t; } });
  }
  function bakeGeometry(src, matrix, keepColor) {
    const pos = src.getAttribute('position');
    if (!pos || pos.count === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', copyAttr(pos));
    if (src.getAttribute('normal')) g.setAttribute('normal', copyAttr(src.getAttribute('normal')));
    if (keepColor && src.getAttribute('color')) g.setAttribute('color', copyAttr(src.getAttribute('color'), true));
    const idx = drawIndex(src);
    if (idx) { if (!idx.length) return null; g.setIndex(idx); }
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    g.applyMatrix4(matrix);
    if (matrix.determinant() < 0) flipWinding(g);
    return g;
  }
  // an InstancedMesh as one plain geometry (instance colours become COLOR_0), in the InstancedMesh's own frame
  function expandInstanced(im) {
    const base = im.geometry.index ? im.geometry.toNonIndexed() : im.geometry;
    const P = base.attributes.position, N = base.attributes.normal, M = new THREE.Matrix4(), NM = new THREE.Matrix3();
    const pos = [], nor = [], col = [], v = new THREE.Vector3(), c = new THREE.Color();
    const tint = firstMat(im).color || new THREE.Color(1, 1, 1);
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, M); NM.getNormalMatrix(M);
      if (im.instanceColor) c.setRGB(im.instanceColor.getX(i), im.instanceColor.getY(i), im.instanceColor.getZ(i)).multiply(tint); else c.copy(tint);
      for (let j = 0; j < P.count; j++) {
        v.fromBufferAttribute(P, j).applyMatrix4(M); pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(N, j).applyMatrix3(NM).normalize(); nor.push(v.x, v.y, v.z);
        col.push(c.r, c.g, c.b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  }

  // ---------- which meshes of an object get exported ----------
  function exportableMeshes(o) {
    const out = [];
    const walk = (node, interior) => {
      if (!node.visible || HELPER_NAMES.has(node.name)) return;
      const inside = interior || !!(node.userData && node.userData.interior);
      const mat = node.isMesh ? firstMat(node) : null;
      if (node.isMesh && mat && mat.visible !== false && !(mat.transparent && mat.opacity === 0)) out.push({ mesh: node, interior: inside });
      node.children.forEach(c => walk(c, inside));
    };
    walk(o.mesh, false);
    return out;
  }

  // ---------- roles for meshes the planner does not tag (trees, pads, cars, bridges, walk pieces, earth objects) ----------
  function padSurface(o) {
    const nm = String(o.name || '').toLowerCase();
    const surface = o.surface || SURFACE_WORDS.find(w => nm.includes(w)) || '';
    const use = o.kind || USE_WORDS.find(w => nm.includes(w)) || '';
    return { surface: surface === 'paver' ? 'pavers' : surface, use };
  }
  function inferRole(o, m, ctx) {
    const geo = m.geometry || {}, prm = geo.parameters || {}, mat = firstMat(m) || {};
    if (o.tree || o.t === 'tree') {
      if (geo.type === 'CylinderGeometry') return ctx.trunks++ ? 'branch' : 'trunk';
      return 'foliage';
    }
    if (m.isInstancedMesh) return ({ meadow: ['grass', 'flowers'], pond: ['reeds'] }[o.t] || [])[ctx.instanced++] || 'scatter';
    if (o.t === 'bridge') {
      if (mat.transparent && mat.opacity < 1) return 'glass';
      const i = ctx.bridge++;
      if (i === 0) return 'deck';
      if (i === 1) return 'fascia';
      return (BRIDGE_PRISMS[o.style] || [])[i - 2] || 'structure';
    }
    if (EARTH_T.includes(o.t)) return { boulder: 'rock', meadow: 'meadow', pond: 'water' }[o.t];
    if (o.t === 'pad' && geo.type === 'BoxGeometry' && Math.abs(prm.width - CAR.body) < 1e-6) return 'car_body';
    if (o.t === 'pad' && geo.type === 'BoxGeometry' && Math.abs(prm.width - CAR.cabin) < 1e-6) return 'car_cabin';
    if (o.t === 'pad' && geo.type === 'CylinderGeometry' && Math.abs(prm.radiusTop - CAR.wheel) < 1e-6) return 'car_wheel';
    if (o.t === 'pad' && o.kind) { // walk-model pieces: surface, skirt, posts and rails by their material
      const c = mat.color ? hexOf(mat.color) : '';
      if (c === '#8a8780') return 'skirt';
      if (c === '#6e5a44') return geo.type === 'BoxGeometry' && Math.abs(prm.width - prm.depth) < 1e-6 && prm.height > prm.width ? 'post' : 'rail';
      return 'pad';
    }
    if (o.t === 'pool') return ['coping', 'pool_wall', 'pool_floor', 'pool_lining', 'water', 'glass'][ctx.pool++] || 'pool';
    if (['pad', 'garden', 'septic'].includes(o.t)) return ctx.pads++ ? o.t + '_part' : 'pad';
    return o.t;
  }

  // ---------- extras ----------
  function massOf(o, mi) { return isBuilding(o) ? masses(o)[mi] || null : null; }
  function resolved(o, part, mi, ei) {
    if (!EXT_PARTS.includes(part) || typeof extResolve !== 'function') return null;
    if (!isBuilding(o) && o.t !== 'deck') return null;
    try { return extResolve(o, massOf(o, mi), mi, part, ei); } catch (e) { return null; }
  }
  function meshExtras(o, entry, role, isDecor) {
    const m = entry.mesh, u = m.userData || {}, mat = firstMat(m);
    const plannerPart = entry.interior && u.part === 'wall' ? INTERIOR_WALL : u.part; // keep partitions apart from the exterior walls
    const ex = { part: plannerPart || role, partSrc: u.part ? 'planner' : 'inferred', oid: o.id, objName: o.name, t: o.t };
    if (u.mi != null) ex.mi = u.mi;
    if (u.ei != null) ex.ei = u.ei;
    const mass = u.mi != null ? massOf(o, u.mi) : null;
    if (mass) ex.massKind = mass.kind || 'wall';
    const r = entry.interior ? null : resolved(o, ex.part, u.mi || 0, u.ei);
    if (r) {
      if (ex.part === 'wall') { ex.wallKind = r.kind || 'painted'; if (r.tint) ex.glassTint = r.tint; }
      if (ex.part === 'roof') ex.roofMat = r.mat || 'plain';
      if (ex.part === 'rail') ex.railStyle = r.style || 'wood';
      if (r.color) ex.color = r.color;
    }
    if (mat && mat.color) ex.matColor = hexOf(mat.color);
    if (mat && mat.transparent && mat.opacity < 1) ex.opacity = +mat.opacity.toFixed(3);
    if (entry.interior || ex.part === 'furniture') ex.interior = true;
    if (isDecor) ex.decor = true;
    if (['pad', 'garden', 'septic'].includes(o.t) && ex.part === 'pad') Object.assign(ex, padSurface(o));
    if (o.t === 'bridge') ex.bridgeStyle = o.style || '';
    if (o.tree && o.species) ex.species = o.species;
    if (m.isInstancedMesh) ex.instances = m.count;
    return ex;
  }
  function objectExtras(o) {
    return { oid: o.id, name: o.name, t: o.t, x: r4(o.x), n: r4(o.n), rot: o.rot || 0, floor: r4(o.floor), grade: r4(o.grade ?? o.floor) };
  }

  // ---------- nodes ----------
  function meshNode(name, geometry, material, extras) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.userData = extras;
    return mesh;
  }
  function objectNode(o, mat, stats) {
    const node = new THREE.Group();
    node.name = nodeName(o);
    node.userData = objectExtras(o);
    o.mesh.updateWorldMatrix(true, true);
    o.mesh.matrixWorld.decompose(node.position, node.quaternion, node.scale);
    const toObj = new THREE.Matrix4().copy(o.mesh.matrixWorld).invert();
    const ctx = { trunks: 0, instanced: 0, bridge: 0, pool: 0, pads: 0 };
    exportableMeshes(o).forEach(entry => {
      const m = entry.mesh;
      const role = m.userData && m.userData.part ? null : inferRole(o, m, ctx);
      const isDecor = !!(m.parent && m.parent.isMesh && m.parent.userData && m.parent.userData.part === 'wall');
      const ex = meshExtras(o, entry, role, isDecor);
      const rel = new THREE.Matrix4().multiplyMatrices(toObj, m.matrixWorld);
      const vertexColors = m.isInstancedMesh || !!(firstMat(m).vertexColors && m.geometry.getAttribute('color'));
      const geo = m.isInstancedMesh ? bakeGeometry(expandInstanced(m), rel, true) : bakeGeometry(m.geometry, rel, vertexColors);
      if (!geo) { stats.skipped++; return; }
      const k = node.children.length;
      const name = [node.name, ex.part, ex.mi != null ? 'm' + ex.mi : null, ex.ei != null ? 'e' + ex.ei : null, k].filter(s => s !== null).join('|');
      ex.k = k;
      node.add(meshNode(name, geo, mat(materialKey(ex, firstMat(m), vertexColors), firstMat(m), { vertexColors }), ex));
    });
    return node;
  }
  function terrainNode(mat) {
    terrain.updateWorldMatrix(true, false);
    const geo = bakeGeometry(terrainGeo, terrain.matrixWorld, true);
    return meshNode('Terrain', geo, mat('terrain vertex', terrain.material, { vertexColors: true }),
      { part: 'terrain', note: 'USGS 3DEP 2 m grid; cells under the earthworks patch are left out (see Earthworks); COLOR_0 = planner tint incl. setback overlays' });
  }
  function nearestBuilding(geo) {
    geo.computeBoundingBox();
    const c = geo.boundingBox.getCenter(new THREE.Vector3());
    let best = null, bd = Infinity;
    objects.filter(o => isBuilding(o) && earthOf(o)).forEach(o => { const d = Math.hypot(o.x - c.x, o.n + c.z); if (d < bd) { bd = d; best = o; } });
    return best;
  }
  function earthworksNode(mat) {
    const node = new THREE.Group();
    node.name = 'Earthworks';
    node.userData = { part: 'earthworks' };
    earthGroup.updateWorldMatrix(true, true);
    earthGroup.children.forEach(m => {
      if (!m.isMesh || !m.visible) return;
      const geo = bakeGeometry(m.geometry, m.matrixWorld, true);
      if (!geo) return;
      const part = m.name === 'retaining' ? 'retaining' : 'earthworks';
      const ex = { part, partSrc: 'planner' };
      if (part === 'retaining') { const o = nearestBuilding(geo); if (o) Object.assign(ex, { oid: o.id, objName: o.name, wallMat: earthOf(o).wallMat }); }
      node.add(meshNode(`Earthworks|${part}|${node.children.length}`, geo, mat(`${part} vertex`, m.material, { vertexColors: true }), ex));
    });
    return node;
  }
  function waterNode(mat) {
    const W = (nx - 1) * sp, D = (ny - 1) * sp;
    const geo = new THREE.PlaneGeometry(W, D, 1, 1);
    geo.deleteAttribute('uv');
    geo.rotateX(-Math.PI / 2);
    geo.translate(gx0 + W / 2, water.position.y, -(gn0 + D / 2));
    const tide = +$('tide').value;
    return meshNode('Water', geo, mat('water', water.material), { part: 'water', tide_ft: tide, level_m: r4(tide * FT), note: 'clipped to the terrain grid' });
  }

  // ---------- manifest data ----------
  const ptW = p => [r4(p[0]), r4(p[1])];
  function massEntry(o, m, mi) {
    const curved = isCurved(m), walled = !isOpen(m) && !isAccess(m);
    const outline = massCorners(o, m).map(ptW);
    const roof = m.roof && m.roof !== 'none' ? resolved(o, 'roof', mi) : null;
    const e = {
      mi, kind: m.kind || 'wall', shape: m.shape || 'rect', curved, open: isOpen(m), level_ft: wingLevel(m),
      base_m: r4(o.floor + wingLevel(m) * FT), base_z: r4(o.floor * exag + wingLevel(m) * FT), height_m: r4((m.h || 0) * FT),
      w_ft: m.w, d_ft: m.d, h_ft: m.h, rot: m.rot || 0, roof: m.roof || 'none', pitch: m.pitch, roofMat: roof ? roof.mat || 'plain' : null, roofColor: roof ? roof.color : null,
      outline, wallEi: !walled ? 'none' : curved ? 'perimeter' : 'edge',
    };
    if (walled) {
      const edges = curved ? [0] : outline.map((_, i) => i);
      e.walls = edges.map(ei => { const r = resolved(o, 'wall', mi, ei) || {}; return { ei, kind: r.kind || 'painted', color: r.color || null }; });
    }
    return e;
  }
  function objectEntry(o) {
    const e = Object.assign({ node: nodeName(o) }, objectExtras(o), {
      gradeChange: r4(o.gradeChange || 0), lift_ft: o.lift || 0, w_ft: o.w, d_ft: o.d, h_ft: o.h, shape: o.shape || 'rect', color: o.color || null,
    });
    if (isBuilding(o)) {
      Object.assign(e, { roof: o.roof, roofColor: o.roofColor || null, walls: o.walls || null, ext: o.ext || null, support: o.support || 'auto', earth: o.earth || null });
      e.masses = masses(o).map((m, mi) => massEntry(o, m, mi));
    } else if (o.t === 'bridge') {
      Object.assign(e, { style: o.style || '', pts: (o.pts || []).map(p => [r4(p[0]), r4(p[1]), r4(p[2] * FT)]), ptsNote: '[x, n, deck elevation m NAVD88]' });
    } else if (o.tree || o.t === 'tree') {
      Object.assign(e, { species: o.species || 'madrone', crown: (o.w || 0) * FT, height_m: r4((o.h || 0) * FT) });
    } else {
      e.outline = (o.shape === 'ribbon' || (o.shape && o.shape !== 'rect') ? padPoly(o) : massPoly({ w: o.w, d: o.d, shape: 'rect' })).map(p => ptW(localToWorld(o, p[0], p[1])));
      if (['pad', 'garden', 'septic'].includes(o.t)) Object.assign(e, padSurface(o), { cars: o.cars || 0 });
    }
    return e;
  }
  function sunEntry() {
    const hour = +$('hour').value, season = $('season').value, lat = 48.46; // the planner's own latitude and solar model (updateSun)
    const decl = { jun: 23.44, sep: 0, dec: -23.44 }[season] * Math.PI / 180, la = lat * Math.PI / 180, H = (hour - 12.3) * 15 * Math.PI / 180;
    const el = Math.asin(Math.sin(la) * Math.sin(decl) + Math.cos(la) * Math.cos(decl) * Math.cos(H));
    let az = Math.acos(THREE.MathUtils.clamp((Math.sin(decl) - Math.sin(la) * Math.sin(el)) / (Math.cos(la) * Math.cos(el)), -1, 1));
    if (H > 0) az = 2 * Math.PI - az;
    const d = sun.position.clone().sub(sun.target.position).normalize();
    return { hour, season, lat, elevation_deg: r4(el * 180 / Math.PI), azimuth_deg: r4(az * 180 / Math.PI), azimuthFrom: 'north, clockwise',
      lightDir_xnz: [r4(d.x), r4(-d.z), r4(d.y)], intensity: r4(sun.intensity), hemi: r4(hemi.intensity) };
  }
  function manifestData() {
    return {
      site: {
        frame: 'metres; x east, n north, origin at the terrain grid centre. glTF: Y up, -Z north. Blender: X east, Y north, Z = elevation x exag',
        verticalDatum: 'NAVD88 (metres)', exag,
        grid: { lon0: GRID.lon0, lat0: GRID.lat0, mPerDegLon: GRID.mlon, mPerDegLat: GRID.mlat, spacing: sp, nx, ny, x0: gx0, n0: gn0,
          geo: 'lon0/lat0 = grid sample (0,0) at (x0, n0): lon = lon0 + (x - x0) / mPerDegLon, lat = lat0 + (n - n0) / mPerDegLat' },
        tide_ft: +$('tide').value, water_m: r4(+$('tide').value * FT),
      },
      parcel: { ring: PARCEL.ring.map(ptW), shoreEdges: [SHORE_START, SHORE_END], lotSqFt: LOT_SQFT,
        setbacks_ft: { shore: +$('sb-shore').value, side: +$('sb-side').value, bank: +$('sb-bank').value } },
      sun: sunEntry(),
      earthworks: { retainingWalls: (earthWalls || []).map(w => ({ mat: w.mat, floor_m: r4(w.floor), pts: w.pts.map(ptW), outer: w.outer.map(ptW), tops_m: w.tops.map(r4) })) },
      objects: objects.map(objectEntry),
    };
  }

  // ---------- export ----------
  function toBase64(buf) {
    const bytes = new Uint8Array(buf), CHUNK = 0x8000;
    let s = '';
    for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    return btoa(s);
  }
  async function build() {
    if (!THREE.GLTFExporter) throw new Error('THREE.GLTFExporter is not loaded');
    scene.updateMatrixWorld(true);
    const mat = materialCache(), stats = { skipped: 0 };
    const root = new THREE.Scene();
    root.name = 'Islandale';
    const objectsNode = new THREE.Group();
    objectsNode.name = 'Objects';
    objectsNode.userData = { part: 'objects', count: objects.length };
    objects.forEach(o => objectsNode.add(objectNode(o, mat, stats)));
    root.add(terrainNode(mat), earthworksNode(mat), waterNode(mat), objectsNode);
    const glb = await new Promise((resolve, reject) => {
      try { new THREE.GLTFExporter().parse(root, resolve, { binary: true, trs: true, onlyVisible: true, truncateDrawRange: true }); } catch (e) { reject(e); }
    });
    return { glb: toBase64(glb), manifest: manifestData(), skipped: stats.skipped };
  }

  window.islandaleExport = { signature, loadScheme, loadLayoutJson, setExag, build };
})();
