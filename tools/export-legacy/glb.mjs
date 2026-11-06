// Binary glTF (.glb) helpers for the Islandale exporter: split a GLB into its JSON and BIN chunks, write one back, and finish the
// JSON three.js's GLTFExporter leaves bare (it names nodes and gives them extras, but leaves glTF meshes unnamed and without extras).
const GLB_MAGIC = 0x46546c67;     // 'glTF'
const GLB_VERSION = 2;
const CHUNK_JSON = 0x4e4f534a;    // 'JSON'
const CHUNK_BIN = 0x004e4942;     // 'BIN\0'
const HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;
const TRIANGLES = 4;              // glTF primitive mode

/** @param {Buffer} buf @returns {{json: object, bin: Buffer}} */
export function readGlb(buf) {
  if (buf.length < HEADER_BYTES || buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error('not a GLB file');
  if (buf.readUInt32LE(4) !== GLB_VERSION) throw new Error(`unsupported GLB version ${buf.readUInt32LE(4)}`);
  let off = HEADER_BYTES, json = null, bin = Buffer.alloc(0);
  while (off + CHUNK_HEADER_BYTES <= buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const body = buf.subarray(off + CHUNK_HEADER_BYTES, off + CHUNK_HEADER_BYTES + len);
    if (type === CHUNK_JSON) json = JSON.parse(body.toString('utf8'));
    else if (type === CHUNK_BIN) bin = body;
    off += CHUNK_HEADER_BYTES + len;
  }
  if (!json) throw new Error('GLB has no JSON chunk');
  return { json, bin };
}

const pad4 = (b, fill) => (b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4), fill)]) : b);
const chunk = (type, body) => { const h = Buffer.alloc(CHUNK_HEADER_BYTES); h.writeUInt32LE(body.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, body]); };

/** @param {object} json @param {Buffer} bin @returns {Buffer} */
export function writeGlb(json, bin) {
  const parts = [chunk(CHUNK_JSON, pad4(Buffer.from(JSON.stringify(json), 'utf8'), 0x20))];
  if (bin.length) parts.push(chunk(CHUNK_BIN, pad4(bin, 0)));
  const body = Buffer.concat(parts), head = Buffer.alloc(HEADER_BYTES);
  head.writeUInt32LE(GLB_MAGIC, 0); head.writeUInt32LE(GLB_VERSION, 4); head.writeUInt32LE(HEADER_BYTES + body.length, 8);
  return Buffer.concat([head, body]);
}

/** Name every glTF mesh after its node and copy the node's extras onto it, so Blender puts them on the mesh data too.
 * Returns a new JSON object (the input is left as it was). @param {object} json @param {object} sceneExtras */
export function finishJson(json, sceneExtras) {
  const meshes = (json.meshes || []).map(m => ({ ...m }));
  (json.nodes || []).forEach(n => {
    if (n.mesh == null) return;
    meshes[n.mesh] = { ...meshes[n.mesh], name: n.name, ...(n.extras ? { extras: { ...n.extras } } : {}) };
  });
  const scenes = (json.scenes || []).map((s, i) => (i === (json.scene || 0) ? { ...s, extras: { ...(s.extras || {}), ...sceneExtras } } : s));
  return { ...json, meshes, scenes };
}

/** Meshes, triangles and materials in a GLB's JSON. @param {object} json */
export function countGlb(json) {
  let triangles = 0;
  (json.meshes || []).forEach(m => m.primitives.forEach(p => {
    if ((p.mode ?? TRIANGLES) !== TRIANGLES) return;
    const acc = json.accessors[p.indices ?? p.attributes.POSITION];
    triangles += Math.floor(acc.count / 3);
  }));
  return { nodes: (json.nodes || []).length, meshes: (json.meshes || []).length, materials: (json.materials || []).length, triangles };
}
