#!/usr/bin/env node
// Record an isolated-turntable orientation audit into asset_manifest.json.
//
// Workflow: open /regeneration.html?audit=<assetId> (pure-background turntable
// at labeled 45-degree yaw steps; camera at yaw 0 sits on +Z), pick the yaw
// where the character faces the camera, then run:
//
//   node record-orientation.mjs --cwd <dir> --asset <id> --front-yaw <deg> [--frames <path>]
//
// Writes asset.orientation with the measured yaw, the derived native forward
// axis, the mechanical calibration angle toward canonical +Z, the base GLB
// content hash, and status AXIS_AUDITED. Higher Gate-1 states
// (MATH_VERIFIED / VISUALLY_VERIFIED / ACCEPTED) still come from the
// downstream movement tests and rendered acceptance, never from this tool.

import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";

const argv = process.argv.slice(2);

function option(name) {
  const exact = `--${name}`;
  const index = argv.indexOf(exact);
  if (index >= 0) return argv[index + 1];
  const prefix = `${exact}=`;
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

const cwd = path.resolve(option("cwd") || process.cwd());
const assetId = option("asset");
const frontYawRaw = option("front-yaw");
const frames = option("frames");
if (!assetId || frontYawRaw === undefined || String(frontYawRaw).trim() === "") {
  process.stderr.write("usage: record-orientation.mjs --cwd <dir> --asset <id> --front-yaw <deg> [--frames <path>]\n");
  process.exit(1);
}
const parsedYaw = Number(frontYawRaw);
if (!Number.isFinite(parsedYaw)) {
  process.stderr.write("--front-yaw must be a number in degrees.\n");
  process.exit(1);
}
const frontYaw = ((parsedYaw % 360) + 360) % 360;

const CARDINALS = [
  { yaw: 0, axis: "+Z" },
  { yaw: 90, axis: "+X" },
  { yaw: 180, axis: "-Z" },
  { yaw: 270, axis: "-X" },
  { yaw: 360, axis: "+Z" }
];
const nearest = CARDINALS.reduce((best, entry) => (Math.abs(frontYaw - entry.yaw) < Math.abs(frontYaw - best.yaw) ? entry : best));
const cardinalDelta = Math.abs(frontYaw - nearest.yaw);
const nativeForwardAxis = cardinalDelta <= 15 ? nearest.axis : `custom(front-yaw=${frontYaw})`;
let calibrationYawDegrees = -frontYaw;
while (calibrationYawDegrees <= -180) calibrationYawDegrees += 360;
while (calibrationYawDegrees > 180) calibrationYawDegrees -= 360;

const manifestFile = path.join(cwd, "asset_manifest.json");
const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
const asset = (manifest.assets || []).find((entry) => entry?.id === assetId);
if (!asset) {
  process.stderr.write(`Asset ${assetId} not found in ${manifestFile}.\n`);
  process.exit(1);
}

const runtimeUrl = asset.model?.url || asset.url;
let sourceHash;
if (typeof runtimeUrl === "string" && !/^https?:\/\//i.test(runtimeUrl)) {
  const publicDir = path.resolve(cwd, "public");
  const file = path.resolve(publicDir, runtimeUrl.replace(/^\.\//, "").replace(/^public\//, "").replace(/^\/+/, ""));
  if (file.startsWith(`${publicDir}${path.sep}`)) {
    try {
      sourceHash = `sha256:${createHash("sha256").update(await readFile(file)).digest("hex")}`;
    } catch {
      // recorded below as missing
    }
  }
}
if (!sourceHash) {
  process.stderr.write(`Cannot hash the base GLB for ${assetId} (url: ${runtimeUrl}); refusing to record an audit that cannot be invalidated.\n`);
  process.exit(1);
}

asset.orientation = {
  nativeForwardAxis,
  canonicalForwardAxis: "+Z",
  calibrationYawDegrees,
  measuredFrontYawDegrees: frontYaw,
  auditMethod: `isolated-turntable-v1 (/regeneration.html?audit=..., 45-degree labeled yaws)${frames ? `; frames: ${frames}` : ""}`,
  sourceHash,
  status: "AXIS_AUDITED"
};

await writeFile(manifestFile, JSON.stringify(manifest, null, 2));
process.stdout.write(`${JSON.stringify({ status: "ok", assetId, orientation: asset.orientation, manifestFile }, null, 2)}\n`);
