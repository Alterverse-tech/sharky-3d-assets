#!/usr/bin/env node
// Offline bench for issue #10: setup-regeneration-preview.mjs must succeed in
// a dependency-free directory (no esbuild anywhere up the tree) by falling
// back to the prebuilt bundle, and the result must pass the preview validator.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const setupScript = path.join(repoRoot, "shark-game-assets", "scripts", "setup-regeneration-preview.mjs");
const validateScript = path.join(repoRoot, "shark-game-assets", "scripts", "validate-regeneration-preview.mjs");
const work = mkdtempSync(path.join(os.tmpdir(), "preview-bench-"));
const results = [];

function record(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

function run(script, args) {
  try {
    return { status: 0, stdout: execFileSync("node", [script, ...args], { encoding: "utf8" }) };
  } catch (error) {
    return { status: error.status ?? 1, stdout: `${error.stdout || ""}${error.stderr || ""}` };
  }
}

// A. clean-room setup succeeds via the prebuilt bundle
const setup = run(setupScript, ["--cwd", work]);
let setupJson = {};
try {
  setupJson = JSON.parse(setup.stdout);
} catch {
  // recorded below
}
record(
  "A: setup succeeds without esbuild",
  setup.status === 0 && setupJson.status === "ok" && setupJson.bundleSource === "prebuilt",
  `bundleSource=${setupJson.bundleSource ?? "n/a"}`
);

// B. bundle file landed and the html cache-buster points at it
const bundleFile = path.join(work, "public", "regeneration-preview.bundle.js");
const html = existsSync(path.join(work, "public", "regeneration.html"))
  ? readFileSync(path.join(work, "public", "regeneration.html"), "utf8")
  : "";
record(
  "B: bundle + versioned script tag present",
  existsSync(bundleFile) && readFileSync(bundleFile).length > 100000 && /regeneration-preview\.bundle\.js\?v=[0-9a-f]{12}/.test(html)
);

// C. the standard validator accepts the clean-room result
const validate = run(validateScript, ["--cwd", work]);
record("C: validate-regeneration-preview passes", validate.status === 0, validate.status === 0 ? "" : validate.stdout.slice(-160));

// C2. imported Asset Center GLBs under public/assets are valid ready files.
mkdirSync(path.join(work, "public", "assets", "asset-center", "hero"), { recursive: true });
writeFileSync(path.join(work, "public", "assets", "asset-center", "hero", "model.glb"), "glb-bytes");
writeFileSync(path.join(work, "regeneration-plan.json"), JSON.stringify({ version: 1, runId: "reused", items: [{ id: "hero", name: "Hero", role: "player", actions: [] }] }));
writeFileSync(path.join(work, "public", "regeneration-status.json"), JSON.stringify({ status: "ready", runId: "reused", items: [{ id: "hero", name: "Hero", role: "player", status: "ready", progress: 100, runtimeUrl: "/assets/asset-center/hero/model.glb", clips: [], error: "" }] }));
const reusedValidate = run(validateScript, ["--cwd", work]);
record("C2: validator accepts reused /assets GLBs", reusedValidate.status === 0, reusedValidate.status === 0 ? "" : reusedValidate.stdout.slice(-180));

// D. drift detection: the prebuilt bundle must have been built from the
// current template source (edit the template -> rebuild bundle + meta)
import("node:crypto").then(() => {});
const { createHash } = await import("node:crypto");
const templateDir = path.join(repoRoot, "shark-game-assets", "templates", "regeneration");
try {
  const meta = JSON.parse(readFileSync(path.join(templateDir, "regeneration-preview.bundle.meta.json"), "utf8"));
  const sourceSha = createHash("sha256").update(readFileSync(path.join(templateDir, "regeneration-preview.js"))).digest("hex");
  const bundleSha = createHash("sha256").update(readFileSync(path.join(templateDir, "regeneration-preview.bundle.js"))).digest("hex");
  record("D: prebuilt bundle in sync with template source", meta.sourceSha256 === sourceSha && meta.bundleSha256 === bundleSha, sourceSha === meta.sourceSha256 ? "" : "template changed without bundle rebuild");
} catch (error) {
  record("D: prebuilt bundle in sync with template source", false, error.message.slice(0, 80));
}

rmSync(work, { recursive: true, force: true });
const failed = results.filter((entry) => !entry.pass);
console.log(failed.length ? `\n${failed.length} scenario(s) failed` : "\nAll scenarios passed");
process.exit(failed.length ? 1 : 0);
