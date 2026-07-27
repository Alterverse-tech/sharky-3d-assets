#!/usr/bin/env node
// Offline bench for glb-tools (issues #9/#8): clip stripping keeps animation
// data byte-identical while dropping meshes/skins/textures, and metadata
// extraction reads bones + bind-pose bounds.
//
// Uses a synthesized GLB fixture (mesh + texture + skin + 2-channel
// animation), so no network or real service is involved. If an R28 clip GLB
// is present on disk, it is stripped too as a real-world spot check.

import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readGlb, writeGlb, stripClipGlb, extractGlbMeta } from "../shark-game-assets/scripts/glb-tools.mjs";

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

// --- synthesize the fixture ---
const times = Buffer.from(new Float32Array([0, 0.5, 1]).buffer);
const rotations = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0.7071, 0, 0.7071, 0, 1, 0, 0]).buffer);
const positionsAnim = Buffer.from(new Float32Array([0, 0, 0, 0, 0.1, 0, 0, 0.2, 0]).buffer);
const meshPositions = Buffer.from(new Float32Array([0, -0.4, 0, 1, 2.1, 0, -1, 2.1, 0.5]).buffer);
const fakeTexture = Buffer.alloc(64 * 1024, 0xab);
const segments = [times, rotations, positionsAnim, meshPositions, fakeTexture];
const bufferViews = [];
let offset = 0;
const chunks = [];
for (const segment of segments) {
  const pad = (4 - (offset % 4)) % 4;
  if (pad) {
    chunks.push(Buffer.alloc(pad));
    offset += pad;
  }
  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: segment.length });
  chunks.push(segment);
  offset += segment.length;
}
const bin = Buffer.concat(chunks);
const fixtureJson = {
  asset: { version: "2.0" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [
    { name: "root", children: [1, 2] },
    { name: "spine", translation: [0, 1, 0] },
    { name: "head", mesh: 0, skin: 0 }
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: 3, type: "SCALAR", min: [0], max: [1] },
    { bufferView: 1, componentType: 5126, count: 3, type: "VEC4" },
    { bufferView: 2, componentType: 5126, count: 3, type: "VEC3" },
    { bufferView: 3, componentType: 5126, count: 3, type: "VEC3", min: [-1, -0.4, 0], max: [1, 2.1, 0.5] }
  ],
  bufferViews,
  buffers: [{ byteLength: bin.length }],
  meshes: [{ primitives: [{ attributes: { POSITION: 3 }, material: 0 }] }],
  materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
  textures: [{ source: 0 }],
  images: [{ bufferView: 4, mimeType: "image/png" }],
  skins: [{ joints: [1, 2] }],
  animations: [
    {
      name: "preset:biped:walk",
      channels: [
        { sampler: 0, target: { node: 1, path: "rotation" } },
        { sampler: 1, target: { node: 2, path: "translation" } }
      ],
      samplers: [
        { input: 0, output: 1, interpolation: "LINEAR" },
        { input: 0, output: 2, interpolation: "LINEAR" }
      ]
    }
  ]
};
const fixture = writeGlb(fixtureJson, bin);

// A. metadata extraction on the fixture
const meta = extractGlbMeta(fixture);
record(
  "A: extractGlbMeta bones + bbox",
  JSON.stringify(meta.bones) === JSON.stringify(["spine", "head"]) &&
    JSON.stringify(meta.geometry?.bboxMin) === JSON.stringify([-1, -0.4, 0]) &&
    meta.geometry?.originYOffset === -0.4,
  JSON.stringify(meta)
);

// B. strip: smaller, and heavy sections gone
const stripped = stripClipGlb(fixture);
const strippedJson = readGlb(stripped).json;
record(
  "B: strip drops mesh/skin/texture sections",
  stripped.length < fixture.length &&
    !("meshes" in strippedJson) &&
    !("skins" in strippedJson) &&
    !("materials" in strippedJson) &&
    !("textures" in strippedJson) &&
    !("images" in strippedJson),
  `${Math.round(fixture.length / 1024)}KB -> ${Math.round(stripped.length / 1024)}KB`
);

// C. animation survives channel-for-channel with identical sampler bytes
const strippedBin = readGlb(stripped).bin;
function accessorBytes(glb, accessorIndex) {
  const view = glb.json.bufferViews[glb.json.accessors[accessorIndex].bufferView];
  return glb.bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
}
const sourceGlb = { json: fixtureJson, bin };
const strippedGlb = { json: strippedJson, bin: strippedBin };
const animation = strippedJson.animations?.[0];
const channelsIntact =
  animation &&
  animation.name === "preset:biped:walk" &&
  animation.channels.length === 2 &&
  animation.channels[0].target.node === 1 &&
  animation.channels[1].target.path === "translation" &&
  animation.samplers.every((sampler) => sampler.interpolation === "LINEAR");
const bytesIntact =
  channelsIntact &&
  accessorBytes(strippedGlb, animation.samplers[0].input).equals(accessorBytes(sourceGlb, 0)) &&
  accessorBytes(strippedGlb, animation.samplers[0].output).equals(accessorBytes(sourceGlb, 1)) &&
  accessorBytes(strippedGlb, animation.samplers[1].output).equals(accessorBytes(sourceGlb, 2));
record("C: animation channels + sampler bytes intact", Boolean(bytesIntact));

// D. node names and hierarchy survive (GLTFLoader targets tracks by name)
record(
  "D: node names/hierarchy preserved",
  JSON.stringify(strippedJson.nodes.map((node) => node.name)) === JSON.stringify(["root", "spine", "head"]) &&
    JSON.stringify(strippedJson.nodes[0].children) === JSON.stringify([1, 2]) &&
    strippedJson.nodes[2].mesh === undefined &&
    strippedJson.nodes[2].skin === undefined
);

// E. animation-less GLB is refused (base models must never be stripped)
let refused = false;
try {
  stripClipGlb(writeGlb({ ...fixtureJson, animations: [] }, bin));
} catch {
  refused = true;
}
record("E: refuses GLB without animations", refused);

// F (optional): real-world clip from R28 if present on this machine
const realClip = path.join(os.homedir(), "Desktop", "sharky-lab-R28", "public", "generated-assets", "moonlit-fox-idle.glb");
if (existsSync(realClip)) {
  try {
    const original = readFileSync(realClip);
    const out = stripClipGlb(original);
    const outJson = readGlb(out).json;
    record(
      "F: real R28 clip strips and keeps animation",
      out.length < original.length / 2 && (outJson.animations?.length ?? 0) > 0,
      `${Math.round(original.length / 1024)}KB -> ${Math.round(out.length / 1024)}KB`
    );
  } catch (error) {
    record("F: real R28 clip strips and keeps animation", false, error.message.slice(0, 80));
  }
} else {
  console.log("SKIP  F: R28 clip not present on this machine");
}

const failed = results.filter((entry) => !entry.pass);
console.log(failed.length ? `\n${failed.length} scenario(s) failed` : "\nAll scenarios passed");
process.exit(failed.length ? 1 : 0);
