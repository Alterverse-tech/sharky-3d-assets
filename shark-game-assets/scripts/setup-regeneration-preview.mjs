#!/usr/bin/env node

import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const cwd = path.resolve(option("cwd") || process.cwd());
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const templateDir = path.resolve(scriptDir, "../templates/regeneration");
const publicDir = path.join(cwd, "public");
const sourceDir = path.join(cwd, "src");
const htmlFile = path.join(publicDir, "regeneration.html");
const sourceFile = path.join(sourceDir, "regeneration-preview.js");
const bundleFile = path.join(publicDir, "regeneration-preview.bundle.js");
const statusFile = path.join(publicDir, "regeneration-status.json");
const planFile = path.join(cwd, "regeneration-plan.json");

function option(name) {
  const exact = `--${name}`;
  const index = argv.indexOf(exact);
  if (index >= 0) return argv[index + 1];
  const prefix = `${exact}=`;
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function findEsbuild() {
  const explicit = option("esbuild") || process.env.ESBUILD_BIN_PATH;
  if (explicit && (await exists(path.resolve(explicit)))) return path.resolve(explicit);
  let directory = cwd;
  for (;;) {
    const candidate = path.join(directory, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
    if (await exists(candidate)) return candidate;
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error("Cannot find esbuild. Install Vite/esbuild in the project or pass --esbuild /absolute/path/to/esbuild.");
}

await mkdir(publicDir, { recursive: true });
await mkdir(sourceDir, { recursive: true });
await mkdir(path.join(publicDir, "generated-assets"), { recursive: true });

await copyFile(path.join(templateDir, "regeneration.html"), htmlFile);
await copyFile(path.join(templateDir, "regeneration-preview.js"), sourceFile);

const explicitPlan = option("plan");
let planCreated = false;
if (explicitPlan) {
  const sourcePlan = path.resolve(cwd, explicitPlan);
  if (sourcePlan !== planFile) await copyFile(sourcePlan, planFile);
  planCreated = true;
} else if (!(await exists(planFile))) {
  const sample = JSON.parse(await readFile(path.join(templateDir, "regeneration-plan.sample.json"), "utf8"));
  sample.runId = `regeneration-${Date.now()}`;
  sample.startedAt = new Date().toISOString();
  await writeFile(planFile, `${JSON.stringify(sample, null, 2)}\n`, "utf8");
  planCreated = true;
}

if (argv.includes("--reset-status") || planCreated || !(await exists(statusFile))) {
  const currentPlan = JSON.parse(await readFile(planFile, "utf8"));
  const items = (currentPlan.items || []).map((item) => ({
    id: item.id,
    name: item.name || item.id,
    role: item.role || "prop",
    status: "pending",
    progress: 0,
    runtimeUrl: "",
    clips: (item.actions || []).map((action) => ({ name: String(action?.name || action), status: "pending", progress: 0, runtimeUrl: "", error: "" })),
    error: ""
  }));
  const initialStatus = {
    status: "pending",
    runId: currentPlan.runId,
    updatedAt: new Date().toISOString(),
    message: "等待生成开始。",
    items,
    failures: []
  };
  await writeFile(statusFile, `${JSON.stringify(initialStatus, null, 2)}\n`, "utf8");
}

// Prefer a project-local esbuild (covers customized viewer sources); fall
// back to the prebuilt bundle shipped with the skill so dependency-free
// checkouts never need a bundler toolchain (issue #10).
const prebuiltBundle = path.join(templateDir, "regeneration-preview.bundle.js");
let bundleSource = "esbuild";
let esbuild;
try {
  esbuild = await findEsbuild();
} catch (error) {
  if (!(await exists(prebuiltBundle))) throw error;
  bundleSource = "prebuilt";
}
if (bundleSource === "esbuild") {
  const result = spawnSync(esbuild, [sourceFile, "--bundle", "--format=iife", "--platform=browser", "--target=es2020", `--outfile=${bundleFile}`], {
    cwd,
    encoding: "utf8",
    stdio: "pipe"
  });
  if (result.status !== 0 || result.error) {
    // A broken local esbuild (present but failing) also falls back.
    if (await exists(prebuiltBundle)) bundleSource = "prebuilt";
    else throw new Error(`esbuild failed:\n${result.error?.message || result.stderr || result.stdout}`);
  }
}
if (bundleSource === "prebuilt") {
  await copyFile(prebuiltBundle, bundleFile);
}

const bundle = await readFile(bundleFile);
const version = createHash("sha256").update(bundle).digest("hex").slice(0, 12);
const html = (await readFile(htmlFile, "utf8")).replace(/regeneration-preview\.bundle\.js(?:\?v=[^"']*)?/g, `regeneration-preview.bundle.js?v=${version}`);
await writeFile(htmlFile, html, "utf8");

process.stdout.write(`${JSON.stringify({
  status: "ok",
  cwd,
  files: { htmlFile, sourceFile, bundleFile, statusFile, planFile },
  bundleVersion: version,
  bundleSource,
  next: `Edit ${planFile}, then run sync-regeneration-status.mjs --cwd ${JSON.stringify(cwd)} --watch.`
}, null, 2)}\n`);
