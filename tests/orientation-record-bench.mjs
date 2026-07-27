#!/usr/bin/env node
// Offline bench for issue #7 tooling: record-orientation.mjs converts a
// picked turntable yaw into the correct axis + mechanical calibration angle,
// hashes the base GLB, and refuses to record an audit it cannot invalidate.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "shark-game-assets", "scripts", "record-orientation.mjs");
const work = mkdtempSync(path.join(os.tmpdir(), "orient-bench-"));
const results = [];

function record(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

function run(args) {
  try {
    return { status: 0, stdout: execFileSync("node", [script, ...args], { encoding: "utf8" }) };
  } catch (error) {
    return { status: error.status ?? 1, stdout: `${error.stdout || ""}${error.stderr || ""}` };
  }
}

function writeManifest() {
  writeFileSync(
    path.join(work, "asset_manifest.json"),
    JSON.stringify({ version: 2, assets: [{ id: "hero", role: "player", url: "/generated-assets/hero.glb", format: "glb" }] }, null, 2)
  );
}
function readOrientation() {
  return JSON.parse(readFileSync(path.join(work, "asset_manifest.json"), "utf8")).assets[0].orientation;
}

mkdirSync(path.join(work, "public", "generated-assets"), { recursive: true });
const glbBytes = Buffer.from("fake-glb-content-for-hashing");
writeFileSync(path.join(work, "public", "generated-assets", "hero.glb"), glbBytes);
const expectedHash = `sha256:${createHash("sha256").update(glbBytes).digest("hex")}`;

// A. yaw 90 -> +X, calibration -90 (matches the R26/R27/AB1/R28 real-world case)
writeManifest();
const a = run(["--cwd", work, "--asset", "hero", "--front-yaw", "90"]);
const orientationA = readOrientation();
record(
  "A: yaw 90 -> +X / calib -90 / AXIS_AUDITED / hash",
  a.status === 0 &&
    orientationA.nativeForwardAxis === "+X" &&
    orientationA.calibrationYawDegrees === -90 &&
    orientationA.status === "AXIS_AUDITED" &&
    orientationA.sourceHash === expectedHash,
  JSON.stringify([orientationA.nativeForwardAxis, orientationA.calibrationYawDegrees])
);

// B. yaw 0 -> +Z, calibration 0
writeManifest();
run(["--cwd", work, "--asset", "hero", "--front-yaw", "0"]);
const orientationB = readOrientation();
record("B: yaw 0 -> +Z / calib 0", orientationB.nativeForwardAxis === "+Z" && orientationB.calibrationYawDegrees === 0);

// C. yaw 270 -> -X / calib 90; yaw 180 -> -Z / calib 180
writeManifest();
run(["--cwd", work, "--asset", "hero", "--front-yaw", "270"]);
const orientationC1 = readOrientation();
writeManifest();
run(["--cwd", work, "--asset", "hero", "--front-yaw", "180"]);
const orientationC2 = readOrientation();
record(
  "C: yaw 270 -> -X/90 and yaw 180 -> -Z/180",
  orientationC1.nativeForwardAxis === "-X" && orientationC1.calibrationYawDegrees === 90 && orientationC2.nativeForwardAxis === "-Z" && orientationC2.calibrationYawDegrees === 180
);

// D. non-cardinal yaw is recorded honestly, never rounded into a cardinal
writeManifest();
run(["--cwd", work, "--asset", "hero", "--front-yaw", "200"]);
const orientationD = readOrientation();
record(
  "D: yaw 200 -> custom axis + exact calib 160",
  orientationD.nativeForwardAxis.startsWith("custom(") && orientationD.calibrationYawDegrees === 160 && orientationD.measuredFrontYawDegrees === 200
);

// F. empty --front-yaw must be rejected, not silently recorded as yaw 0
writeManifest();
const f = run(["--cwd", work, "--asset", "hero", "--front-yaw", ""]);
record("F: empty front-yaw rejected", f.status === 1 && readOrientation() === undefined);

// E. missing base GLB -> refuses to record (audit must stay invalidatable)
writeManifest();
rmSync(path.join(work, "public", "generated-assets", "hero.glb"));
const e = run(["--cwd", work, "--asset", "hero", "--front-yaw", "90"]);
record("E: refuses without hashable GLB", e.status === 1 && readOrientation() === undefined);

rmSync(work, { recursive: true, force: true });
const failed = results.filter((entry) => !entry.pass);
console.log(failed.length ? `\n${failed.length} scenario(s) failed` : "\nAll scenarios passed");
process.exit(failed.length ? 1 : 0);
