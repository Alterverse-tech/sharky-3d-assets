#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const validator = path.join(scriptDir, "validate-game-asset-integration.mjs");
const fixture = await mkdtemp(path.join(os.tmpdir(), ".game-asset-integration-test-"));
function makeGlb(animationName) {
  const json = Buffer.from(JSON.stringify({
    asset: { version: "2.0" },
    animations: animationName ? [{ name: animationName, channels: [], samplers: [] }] : [],
  }));
  const paddedJson = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const result = Buffer.alloc(20 + paddedJson.length);
  result.write("glTF", 0, "ascii");
  result.writeUInt32LE(2, 4);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(paddedJson.length, 12);
  result.writeUInt32LE(0x4e4f534a, 16);
  paddedJson.copy(result, 20);
  return result;
}

const glb = makeGlb("preset:biped:run");
const sha256 = createHash("sha256").update(glb).digest("hex");
const entrySource = "export const game = 'runner';\n";
const entrySha256 = createHash("sha256").update(entrySource).digest("hex");
const pageSource = '<!doctype html><script type="module" src="./main.js"></script>\n';
const pageSha256 = createHash("sha256").update(pageSource).digest("hex");
const evidenceBytes = Buffer.from("rendered-game-frame");
const evidenceSha256 = createHash("sha256").update(evidenceBytes).digest("hex");

function run(...args) {
  return spawnSync(process.execPath, [validator, "--cwd", fixture, ...args], { encoding: "utf8" });
}

function output(result) {
  return `${result.stdout}\n${result.stderr}`;
}

async function writeJson(name, value) {
  const file = path.join(fixture, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

const plan = {
  version: 1,
  schema: "shark-asset-sourcing-plan",
  runId: "runner-gate-test",
  confirmation: {
    confirmed: true,
    confirmedBy: "user",
    confirmedAt: "2026-08-07T00:00:00.000Z",
  },
  slots: [
    {
      id: "runner-player",
      name: "Runner Player",
      role: "player",
      assetKind: "character",
      model: {
        source: "reuse_asset_center",
        assetId: "ast_player",
        resolved: {
          modelPath: "public/assets/player.glb",
          sha256,
          sizeBytes: glb.length,
        },
      },
      actions: [
        {
          name: "run",
          scene: "Automatic forward movement",
          source: "reuse_linked_action",
          assetId: "ast_run",
          parentAssetId: "ast_player",
          resolved: {
            origin: "asset_center",
            modelPath: "public/assets/player-run.glb",
            sha256,
            sizeBytes: glb.length,
          },
        },
      ],
    },
    {
      id: "car-hazard",
      name: "Car Hazard",
      role: "hazard",
      assetKind: "vehicle",
      model: { source: "primitive_fallback" },
      actions: [],
    },
  ],
};

const manifest = {
  version: 2,
  schema: "shark-game-assets-manifest",
  bindings: { player: "runner-player" },
  assets: [
    {
      id: "runner-player",
      role: "player",
      model: { url: "/assets/player.glb", source: "asset_center" },
      actions: {
        run: { url: "/assets/player-run.glb", source: "asset_center_linked_action" },
      },
    },
  ],
};

const runtimeReport = {
  version: 1,
  schema: "shark-game-asset-runtime-report",
  runId: plan.runId,
  observedAt: new Date(Date.now() + 1000).toISOString(),
  evidenceType: "USER_PLAYTEST",
  game: {
    scene: "game",
    url: "http://127.0.0.1:4176/",
    pageFile: "index.html",
    pageSha256,
    entryFile: "main.js",
    entrySha256,
  },
  evidence: [
    {
      kind: "screenshot",
      path: "artifacts/playtest/fixed-game.png",
      sha256: evidenceSha256,
    },
  ],
  slots: [
    {
      id: "runner-player",
      model: {
        status: "loaded",
        visible: true,
        fallbackVisible: false,
        objectName: "runner-player-visual",
        url: "/assets/player.glb",
        sha256,
      },
      actions: {
        run: {
          status: "played",
          url: "/assets/player-run.glb",
          sha256,
          clipName: "preset:biped:run",
        },
      },
    },
    {
      id: "car-hazard",
      model: { status: "primitive_fallback", visible: true },
      actions: {},
    },
  ],
};

try {
  await mkdir(path.join(fixture, "public", "assets"), { recursive: true });
  await writeFile(path.join(fixture, "public", "assets", "player.glb"), glb);
  await writeFile(path.join(fixture, "public", "assets", "player-run.glb"), glb);
  await writeFile(path.join(fixture, "main.js"), entrySource);
  await writeFile(path.join(fixture, "index.html"), pageSource);
  await mkdir(path.join(fixture, "artifacts", "playtest"), { recursive: true });
  await writeFile(path.join(fixture, "artifacts", "playtest", "fixed-game.png"), evidenceBytes);
  await writeJson("asset-sourcing-plan.json", plan);

  let result = run();
  assert.notEqual(result.status, 0, "confirmed GLB missing from manifest must fail");

  await writeJson("asset_manifest.json", manifest);
  result = run();
  assert.equal(result.status, 0, output(result));

  await writeJson("artifacts/playtest/asset-runtime-report.json", {
    ...runtimeReport,
    slots: runtimeReport.slots.map((slot) => slot.id === "runner-player"
      ? { ...slot, model: { status: "primitive_fallback", visible: true }, actions: {} }
      : slot),
  });
  result = run("--require-runtime");
  assert.notEqual(result.status, 0, "silent fallback for a confirmed GLB must fail runtime acceptance");
  assert.match(output(result), /runner-player.*confirmed GLB.*primitive_fallback/i);

  const weakReport = {
    version: runtimeReport.version,
    schema: runtimeReport.schema,
    runId: runtimeReport.runId,
    observedAt: runtimeReport.observedAt,
    evidenceType: runtimeReport.evidenceType,
    slots: runtimeReport.slots.map((slot) => slot.id === "runner-player"
      ? {
          id: slot.id,
          model: { status: "loaded", visible: true, url: "/assets/player.glb", sha256 },
          actions: { run: { status: "played" } },
        }
      : slot),
  };
  await writeJson("artifacts/playtest/asset-runtime-report.json", weakReport);
  result = run("--require-runtime");
  assert.notEqual(result.status, 0, "unbound hand-authored runtime claims must not pass");

  await writeJson("artifacts/playtest/asset-runtime-report.json", runtimeReport);
  result = run("--require-runtime");
  assert.equal(result.status, 0, output(result));

  await writeJson("artifacts/playtest/asset-runtime-report.json", {
    ...runtimeReport,
    slots: runtimeReport.slots.map((slot) => slot.id === "runner-player"
      ? { ...slot, actions: { run: { ...slot.actions.run, clipName: "wrong-clip" } } }
      : slot),
  });
  result = run("--require-runtime");
  assert.notEqual(result.status, 0, "runtime clip name must exist in the confirmed action GLB");

  await writeJson("artifacts/playtest/asset-runtime-report.json", {
    ...runtimeReport,
    observedAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
  result = run("--require-runtime");
  assert.notEqual(result.status, 0, "future-dated runtime evidence must fail freshness validation");

  const validatorSource = await readFile(validator, "utf8");
  assert.match(validatorSource, /primitive_fallback/);
  assert.match(validatorSource, /requireRuntime/);
  const skill = await readFile(path.resolve(scriptDir, "../SKILL.md"), "utf8");
  const finalQa = await readFile(path.resolve(scriptDir, "../subskills/game-final-playtest-fix-acceptance.md"), "utf8");
  assert.match(skill, /validate-game-asset-integration\.mjs/);
  assert.match(skill, /confirmed GLB.*P0 integration failure/i);
  assert.match(finalQa, /confirmed GLB rendered as a primitive.*P0/i);
  assert.match(finalQa, /--require-runtime/);
  process.stdout.write(`${JSON.stringify({ status: "ok", assertions: 14 }, null, 2)}\n`);
} finally {
  await rm(fixture, { recursive: true, force: true });
}
