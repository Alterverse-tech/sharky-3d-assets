// Offline end-to-end cases for the per-asset animations plumbing.
//
// Drives the REAL client (game-assets-mcp.mjs) against a local mock asset API
// (GAME_ASSETS_API_URL=http://127.0.0.1:<port>), so every case exercises the
// full request/response/download/manifest path without any real GLB generation
// or Tripo spend. The mock records every request; each case prints what the
// client sent, what the mock observed, and the verdict.

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillDir = path.join(repo, "shark-game-assets");
const clientPath = path.join(skillDir, "scripts", "game-assets-mcp.mjs");
const { writeGlb } = await import(path.join(skillDir, "scripts", "glb-tools.mjs"));

// Minimal structurally valid GLB; parse-dependent steps (clip strip, metadata)
// fail open on it, which is exactly the offline behavior we want.
const FAKE_GLB = writeGlb({ asset: { version: "2.0" } }, Buffer.alloc(0));

const observed = { requests: [] };
const results = [];

function record(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

function resetObservations() {
  observed.requests = [];
}

function observedBodies(pathname) {
  return observed.requests.filter((request) => request.path === pathname).map((request) => request.body);
}

const server = http.createServer((request, response) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    const rawBody = Buffer.concat(chunks).toString("utf8");
    let body;
    try {
      body = rawBody ? JSON.parse(rawBody) : undefined;
    } catch {
      body = { raw: rawBody };
    }
    const url = new URL(request.url, "http://127.0.0.1");
    observed.requests.push({ method: request.method, path: url.pathname, body });

    if (request.method === "POST" && url.pathname === "/api/asset-jobs") {
      response.writeHead(202, { "content-type": "application/json" });
      response.end(JSON.stringify({ jobId: "job_bench" }));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/asset-jobs/job_bench") {
      // Echo server: build the finished job from what the client actually sent,
      // so the response (and later the local manifest) mirrors the request.
      const createBody = observedBodies("/api/asset-jobs").at(-1) ?? { assets: [] };
      const assets = (createBody.assets ?? []).map((asset) => ({
        id: asset.id,
        role: asset.role,
        name: asset.name,
        downloadUrl: `/dl/${asset.id}.glb`,
        ...(Array.isArray(asset.animations) && asset.animations.length
          ? {
              animationClips: asset.animations.map((preset) => ({
                name: preset.split(":").pop(),
                preset,
                downloadUrl: `/dl/${asset.id}-${preset.split(":").pop()}.glb`
              }))
            }
          : {})
      }));
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ jobId: "job_bench", done: true, status: "success", result: { assets } }));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/asset-jobs/animate") {
      const animations = Array.isArray(body?.animations) ? body.animations : [];
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          status: "rigged",
          rigType: "biped",
          downloadUrl: "/dl/rigged.glb",
          animationClips: animations.map((preset) => ({
            name: preset.split(":").pop(),
            preset,
            downloadUrl: `/dl/clip-${preset.split(":").pop()}.glb`
          }))
        })
      );
      return;
    }
    if (request.method === "GET" && url.pathname.startsWith("/dl/")) {
      response.writeHead(200, { "content-type": "model/gltf-binary" });
      response.end(FAKE_GLB);
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: `unexpected ${request.method} ${url.pathname}` }));
  });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const apiBase = `http://127.0.0.1:${server.address().port}`;

function runClient(caseId, command, params) {
  console.log(`\n── ${caseId} input ──`);
  console.log(`${command} --params ${JSON.stringify(params, null, 2)}`);
  const work = mkdtempSync(path.join(os.tmpdir(), "animations-e2e-"));
  return new Promise((resolve) => {
    execFile(
      "node",
      [clientPath, command, "--cwd", work, "--params", JSON.stringify({ ...params, cwd: work })],
      { env: { ...process.env, GAME_ASSETS_API_URL: apiBase }, timeout: 60000 },
      (error, stdout) => {
        let output;
        try {
          output = JSON.parse(stdout);
        } catch {
          output = { parseError: true, stdout: String(stdout).slice(0, 300) };
        }
        resolve({ exitCode: error?.code ?? 0, output, work });
      }
    );
  });
}

function manifestAsset(work) {
  try {
    return JSON.parse(readFileSync(path.join(work, "asset_manifest.json"), "utf8")).assets?.[0];
  } catch {
    return undefined;
  }
}

// C1: confirmed presets ride the generate request and come back as local clips.
{
  resetObservations();
  const { exitCode, work } = await runClient("C1", "generate", {
    gamePrompt: "escape the clocktower",
    route: "gemini_reference",
    assets: [
      {
        id: "detective",
        role: "player",
        name: "Detective",
        assetKind: "character",
        prompt: "trench coat detective",
        animations: ["preset:biped:walk", "preset:biped:run_upstairs", "preset:biped:hurt"]
      }
    ]
  });
  const sent = observedBodies("/api/asset-jobs").at(-1)?.assets?.[0]?.animations;
  const clips = (manifestAsset(work)?.animationClips ?? []).map((clip) => clip.name);
  const pass =
    exitCode === 0 &&
    JSON.stringify(sent) === JSON.stringify(["preset:biped:walk", "preset:biped:run_upstairs", "preset:biped:hurt"]) &&
    JSON.stringify(clips) === JSON.stringify(["walk", "run_upstairs", "hurt"]);
  record("C1: generate 携带确认的 3 个 preset 并落成本地 clip", pass, `sent=${JSON.stringify(sent)} clips=${JSON.stringify(clips)}`);
}

// C2: an out-of-catalog preset is filtered before any request is sent.
{
  resetObservations();
  await runClient("C2", "generate", {
    gamePrompt: "x",
    route: "gemini_reference",
    assets: [
      {
        id: "hero",
        role: "player",
        name: "Hero",
        assetKind: "character",
        prompt: "hero",
        animations: ["preset:biped:walk", "preset:biped:moonwalk"]
      }
    ]
  });
  const sent = observedBodies("/api/asset-jobs").at(-1)?.assets?.[0]?.animations;
  record("C2: 目录外 preset 在发送前被过滤", JSON.stringify(sent) === JSON.stringify(["preset:biped:walk"]), `sent=${JSON.stringify(sent)}`);
}

// C3: the tripo route never carries animations (static-route contract).
{
  resetObservations();
  await runClient("C3", "generate", {
    gamePrompt: "x",
    route: "tripo",
    assets: [{ id: "crate", role: "prop", name: "Crate", prompt: "crate", animations: ["preset:biped:walk"] }]
  });
  const sentAsset = observedBodies("/api/asset-jobs").at(-1)?.assets?.[0];
  record("C3: tripo 路由剥离 animations 字段", sentAsset && !("animations" in sentAsset), `sentAsset=${JSON.stringify(sentAsset)}`);
}

// C4: more than 3 valid presets are capped to the first 3 before sending.
{
  resetObservations();
  await runClient("C4", "generate", {
    gamePrompt: "x",
    route: "gemini_reference",
    assets: [
      {
        id: "hero",
        role: "player",
        name: "Hero",
        assetKind: "character",
        prompt: "hero",
        animations: ["preset:biped:walk", "preset:biped:climb", "preset:biped:hurt", "preset:biped:jump"]
      }
    ]
  });
  const sent = observedBodies("/api/asset-jobs").at(-1)?.assets?.[0]?.animations;
  record(
    "C4: 超过 3 个 preset 被截断到前 3 个",
    JSON.stringify(sent) === JSON.stringify(["preset:biped:walk", "preset:biped:climb", "preset:biped:hurt"]),
    `sent=${JSON.stringify(sent)}`
  );
}

// C5: animate accepts a newly unlocked catalog preset (climb) end to end.
{
  resetObservations();
  const { exitCode, work } = await runClient("C5", "animate", {
    originalModelTaskId: "task_bench_01",
    assetId: "hero",
    animations: ["preset:biped:climb"]
  });
  const bodies = observedBodies("/api/asset-jobs/animate");
  const clips = (manifestAsset(work)?.animationClips ?? []).map((clip) => clip.name);
  const pass =
    exitCode === 0 &&
    bodies.length === 1 &&
    JSON.stringify(bodies[0]?.animations) === JSON.stringify(["preset:biped:climb"]) &&
    JSON.stringify(clips) === JSON.stringify(["climb"]);
  record("C5: animate 走通目录新 preset climb", pass, `bodies=${JSON.stringify(bodies.map((b) => b.animations))} clips=${JSON.stringify(clips)}`);
}

// C6: an invalid preset is rejected locally; no request reaches the API.
{
  resetObservations();
  const { exitCode, output } = await runClient("C6", "animate", {
    originalModelTaskId: "task_bench_02",
    assetId: "hero",
    animations: ["preset:biped:moonwalk"]
  });
  const pass =
    exitCode === 1 &&
    observed.requests.length === 0 &&
    String(output.errors?.[0] ?? "").includes("preset-catalog.json");
  record("C6: 非法 preset 本地拦截，零远程调用", pass, `requests=${observed.requests.length} error=${String(output.errors?.[0] ?? "").slice(0, 60)}`);
}

// C7: multiple presets split into one /animate call per preset.
{
  resetObservations();
  const { exitCode } = await runClient("C7", "animate", {
    originalModelTaskId: "task_bench_03",
    assetId: "hero",
    animations: ["preset:biped:run", "preset:biped:jump"]
  });
  const bodies = observedBodies("/api/asset-jobs/animate").map((body) => body.animations);
  const pass = exitCode === 0 && JSON.stringify(bodies) === JSON.stringify([["preset:biped:run"], ["preset:biped:jump"]]);
  record("C7: 多 preset 拆分为单 preset 逐次调用", pass, `bodies=${JSON.stringify(bodies)}`);
}

// C8: omitted animations keeps the pinned walk-only default on the wire.
{
  resetObservations();
  const { exitCode } = await runClient("C8", "animate", {
    originalModelTaskId: "task_bench_04",
    assetId: "hero"
  });
  const bodies = observedBodies("/api/asset-jobs/animate").map((body) => body.animations);
  const pass = exitCode === 0 && JSON.stringify(bodies) === JSON.stringify([["preset:biped:walk"]]);
  record("C8: 缺省仍是 walk-only 默认", pass, `bodies=${JSON.stringify(bodies)}`);
}

server.close();

const failed = results.filter((result) => !result.pass);
console.log(failed.length ? `\n${failed.length} case(s) failed` : "\nAll cases passed");
assert.equal(failed.length, 0);
