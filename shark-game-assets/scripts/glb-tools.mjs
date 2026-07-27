// Zero-dependency GLB helpers shared by game-assets-mcp.mjs and the offline
// benches. Origin: the clip-stripping logic reproduces the approach a
// companion-test host had to write by hand (R28), moved upstream per issue #9.

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

export function readGlb(buffer) {
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error("Not a GLB file.");
  let offset = 12;
  let json;
  let bin = Buffer.alloc(0);
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === CHUNK_JSON) json = JSON.parse(body.toString("utf8"));
    else if (type === CHUNK_BIN) bin = body;
    // Spec-compliant chunk lengths are already 4-byte aligned; realign anyway
    // to tolerate sloppy writers.
    offset += 8 + length;
    offset += (4 - (offset % 4)) % 4;
  }
  if (!json) throw new Error("GLB has no JSON chunk.");
  return { json, bin };
}

export function writeGlb(json, bin) {
  const jsonBuf = Buffer.from(JSON.stringify(json));
  const jsonPad = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
  const binPad = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4, 0)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonPad.length + (binPad.length ? 8 + binPad.length : 0), 8);
  const chunkHeader = (length, type) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(length, 0);
    head.writeUInt32LE(type, 4);
    return head;
  };
  const parts = [header, chunkHeader(jsonPad.length, CHUNK_JSON), jsonPad];
  if (binPad.length) parts.push(chunkHeader(binPad.length, CHUNK_BIN), binPad);
  return Buffer.concat(parts);
}

// Strip a retarget-clip GLB down to animation data only. Keeps nodes
// (names + TRS + hierarchy: GLTFLoader derives track targets from them),
// animations, and only the accessors/bufferViews their samplers read.
// Drops meshes, skins, materials, textures, images and unused buffer bytes.
// The clip binds to the base model's skeleton at runtime, so nothing the
// game reads is lost.
export function stripClipGlb(buffer) {
  const { json: source, bin } = readGlb(buffer);
  if (!Array.isArray(source.animations) || source.animations.length === 0) {
    throw new Error("GLB has no animations; refusing to strip.");
  }
  const keepAccessors = new Set();
  for (const animation of source.animations) {
    for (const sampler of animation.samplers || []) {
      keepAccessors.add(sampler.input);
      keepAccessors.add(sampler.output);
    }
  }
  const accessorMap = new Map();
  const accessors = [];
  const bufferViews = [];
  const chunks = [];
  let binLength = 0;
  for (const index of [...keepAccessors].sort((a, b) => a - b)) {
    const accessor = structuredClone(source.accessors[index]);
    if (accessor.bufferView != null) {
      const view = source.bufferViews[accessor.bufferView];
      const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
      const stride = view.byteStride || 0;
      const elementBytes = COMPONENT_BYTES[accessor.componentType] * TYPE_COMPONENTS[accessor.type];
      if (stride && stride !== elementBytes) throw new Error("Interleaved animation accessor; refusing to strip.");
      const length = accessor.count * elementBytes;
      const pad = (4 - (binLength % 4)) % 4;
      if (pad) {
        chunks.push(Buffer.alloc(pad));
        binLength += pad;
      }
      chunks.push(bin.subarray(start, start + length));
      bufferViews.push({ buffer: 0, byteOffset: binLength, byteLength: length });
      binLength += length;
      accessor.bufferView = bufferViews.length - 1;
      delete accessor.byteOffset;
    }
    accessorMap.set(index, accessors.length);
    accessors.push(accessor);
  }
  const nodes = (source.nodes || []).map((node) => {
    const out = {};
    if (node.name !== undefined) out.name = node.name;
    for (const key of ["translation", "rotation", "scale", "matrix", "children"]) {
      if (node[key] !== undefined) out[key] = node[key];
    }
    return out;
  });
  const animations = source.animations.map((animation) => ({
    ...(animation.name !== undefined ? { name: animation.name } : {}),
    channels: animation.channels.map((channel) => ({
      sampler: channel.sampler,
      target: { node: channel.target.node, path: channel.target.path }
    })),
    samplers: (animation.samplers || []).map((sampler) => ({
      input: accessorMap.get(sampler.input),
      output: accessorMap.get(sampler.output),
      ...(sampler.interpolation !== undefined ? { interpolation: sampler.interpolation } : {})
    }))
  }));
  const binOut = Buffer.concat(chunks);
  const json = {
    asset: source.asset || { version: "2.0" },
    scene: 0,
    scenes: source.scenes || [{ nodes: [0] }],
    nodes,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binOut.length }],
    animations
  };
  return writeGlb(json, binOut);
}

// Extract host-facing metadata from a base model GLB: skeleton bone names and
// bind-pose geometry bounds (union of POSITION accessor min/max — node
// transforms are not applied, so treat the values as bind-pose bounds).
export function extractGlbMeta(buffer) {
  const { json } = readGlb(buffer);
  const meta = {};
  const skin = (json.skins || [])[0];
  if (skin && Array.isArray(skin.joints)) {
    meta.bones = skin.joints.map((jointIndex) => json.nodes?.[jointIndex]?.name ?? `joint-${jointIndex}`);
  }
  let min;
  let max;
  for (const mesh of json.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      const positionIndex = primitive.attributes?.POSITION;
      if (positionIndex === undefined) continue;
      const accessor = json.accessors?.[positionIndex];
      if (!accessor?.min || !accessor?.max) continue;
      min = min ? min.map((value, axis) => Math.min(value, accessor.min[axis])) : [...accessor.min];
      max = max ? max.map((value, axis) => Math.max(value, accessor.max[axis])) : [...accessor.max];
    }
  }
  if (min && max) {
    meta.geometry = {
      bboxMin: min,
      bboxMax: max,
      originYOffset: min[1],
      basis: "bind-pose position accessors; node transforms not applied"
    };
  }
  return meta;
}
