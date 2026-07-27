#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureParent = path.resolve(process.env.TEST_PROJECT_ROOT || os.tmpdir());
const fixture = await mkdtemp(path.join(fixtureParent, ".regeneration-preview-test-"));

function run(script, args = []) {
  const result = spawnSync(process.execPath, [path.join(scriptDir, script), "--cwd", fixture, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${script} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

try {
  const skill = await readFile(path.resolve(scriptDir, "../SKILL.md"), "utf8");
  assert.match(skill, /For every task that generates, regenerates, rigs, animates, or integrates GLB assets, create or restore the canonical local preview\/progress page by default/);
  assert.match(skill, /Skip the default preview only for publish-only requests, help\/explanation-only requests, readiness-only or other read-only inspection/);
  assert.match(skill, /public anonymous endpoint/i);
  const assetWorkflow = skill.slice(skill.indexOf("## Asset tool workflow"), skill.indexOf("## Publish a completed game"));
  assert.ok(assetWorkflow.indexOf("setup-regeneration-preview.mjs") < assetWorkflow.indexOf("game-assets-mcp.mjs readiness"), "preview setup must precede readiness in the asset workflow");
  assert.ok(assetWorkflow.indexOf("setup-regeneration-preview.mjs") < assetWorkflow.indexOf("Call the configured public asset API"), "preview setup must precede the public asset API call in the asset workflow");

  const setupArgs = process.env.ESBUILD_BIN_PATH ? ["--esbuild", process.env.ESBUILD_BIN_PATH] : [];
  run("setup-regeneration-preview.mjs", setupArgs);
  const startedAt = new Date(Date.now() - 1000).toISOString();
  await writeFile(path.join(fixture, "regeneration-plan.json"), `${JSON.stringify({
    version: 1,
    runId: "test-run",
    startedAt,
    items: [
      { id: "sample-player", name: "Sample Player", role: "player", actions: ["walk"] },
      { id: "sample-prop", name: "Sample Prop", role: "prop", actions: [] }
    ]
  }, null, 2)}\n`);
  await mkdir(path.join(fixture, "public", "generated-assets"), { recursive: true });
  await writeFile(path.join(fixture, "public", "generated-assets", "sample-player.glb"), Buffer.from("base-glb"));
  await writeFile(path.join(fixture, "asset-jobs.json"), `${JSON.stringify({
    jobId: "job-test",
    status: "running",
    updatedAt: new Date().toISOString(),
    jobs: [
      { id: "sample-player", label: "Sample Player", status: "success", progress: 100, rig: { status: "success", progress: 100, animationClips: [{ name: "walk", status: "success" }] } },
      { id: "sample-prop", label: "Sample Prop", status: "running", progress: 37 }
    ]
  }, null, 2)}\n`);
  await writeFile(path.join(fixture, "asset_manifest.json"), `${JSON.stringify({
    version: 2,
    assets: [{
      id: "sample-player",
      name: "Sample Player",
      model: { url: "/generated-assets/sample-player.glb" },
      actions: {
        walk: { url: "/generated-assets/sample-player-walk.glb" }
      }
    }]
  }, null, 2)}\n`);

  run("sync-regeneration-status.mjs");
  let status = JSON.parse(await readFile(path.join(fixture, "public", "regeneration-status.json"), "utf8"));
  const player = status.items.find((item) => item.id === "sample-player");
  const prop = status.items.find((item) => item.id === "sample-prop");
  assert.equal(player.status, "ready");
  assert.equal(player.clips.some((clip) => clip.name === "idle"), false);
  assert.equal(player.clips.find((clip) => clip.name === "walk").status, "running");
  assert.equal(player.clips.find((clip) => clip.name === "walk").progress, 99);
  assert.equal(prop.status, "running");
  assert.equal(prop.progress, 37);
  run("validate-regeneration-preview.mjs");

  await writeFile(path.join(fixture, "public", "generated-assets", "sample-player-walk.glb"), Buffer.from("walk-glb"));
  run("sync-regeneration-status.mjs");
  status = JSON.parse(await readFile(path.join(fixture, "public", "regeneration-status.json"), "utf8"));
  assert.equal(status.items.find((item) => item.id === "sample-player").clips.find((clip) => clip.name === "walk").status, "ready");
  run("validate-regeneration-preview.mjs");

  // Explicit/historical idle clips remain previewable even though new default plans are walk-only.
  await writeFile(path.join(fixture, "public", "generated-assets", "sample-player-idle.glb"), Buffer.from("idle-glb"));
  await writeFile(path.join(fixture, "regeneration-plan.json"), `${JSON.stringify({
    version: 1,
    runId: "explicit-idle-run",
    startedAt,
    items: [
      { id: "sample-player", name: "Sample Player", role: "player", actions: ["idle", "walk"] },
      { id: "sample-prop", name: "Sample Prop", role: "prop", actions: [] }
    ]
  }, null, 2)}\n`);
  await writeFile(path.join(fixture, "asset_manifest.json"), `${JSON.stringify({
    version: 2,
    assets: [{
      id: "sample-player",
      name: "Sample Player",
      model: { url: "/generated-assets/sample-player.glb" },
      actions: {
        idle: { url: "/generated-assets/sample-player-idle.glb" },
        walk: { url: "/generated-assets/sample-player-walk.glb" }
      }
    }]
  }, null, 2)}\n`);
  run("sync-regeneration-status.mjs");
  status = JSON.parse(await readFile(path.join(fixture, "public", "regeneration-status.json"), "utf8"));
  assert.equal(status.items.find((item) => item.id === "sample-player").clips.find((clip) => clip.name === "idle").status, "ready");
  run("validate-regeneration-preview.mjs");

  const watcher = spawn(process.execPath, [path.join(scriptDir, "sync-regeneration-status.mjs"), "--cwd", fixture, "--watch", "--interval", "100"], { stdio: "ignore" });
  try {
    await writeFile(path.join(fixture, "regeneration-plan.json"), `${JSON.stringify({
      version: 1,
      runId: "hot-reload-run",
      startedAt,
      items: [
        { id: "sample-player", name: "Sample Player", role: "player", actions: ["walk"] },
        { id: "sample-prop", name: "Sample Prop", role: "prop", actions: [] },
        { id: "sample-extra", name: "Sample Extra", role: "prop", actions: [] }
      ]
    }, null, 2)}\n`);
    const deadline = Date.now() + 3000;
    do {
      await new Promise((resolve) => setTimeout(resolve, 100));
      status = JSON.parse(await readFile(path.join(fixture, "public", "regeneration-status.json"), "utf8"));
    } while (status.runId !== "hot-reload-run" && Date.now() < deadline);
    assert.equal(status.runId, "hot-reload-run");
    assert.ok(status.items.some((item) => item.id === "sample-extra"));
  } finally {
    watcher.kill();
    await new Promise((resolve) => watcher.once("exit", resolve));
  }

  const html = await readFile(path.join(fixture, "public", "regeneration.html"), "utf8");
  assert.match(html, /regeneration-preview\.bundle\.js\?v=[a-f0-9]{12}/);
  assert.doesNotMatch(html, /\?v=template/);
  const leftovers = (await readdir(path.join(fixture, "public"))).filter((name) => name.includes(".tmp"));
  assert.deepEqual(leftovers, []);
  process.stdout.write(`${JSON.stringify({ status: "ok", fixture, assertions: 20 }, null, 2)}\n`);
} finally {
  if (!process.env.KEEP_REGENERATION_TEST_FIXTURE) await rm(fixture, { recursive: true, force: true });
}
