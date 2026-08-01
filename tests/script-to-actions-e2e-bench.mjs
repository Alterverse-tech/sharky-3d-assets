// Script-driven end-to-end cases: each case starts from a GAME SCRIPT (剧本/
// 情节/机关剧情), not from preset lists. The chain under test mirrors the
// confirmation gate contract:
//
//   剧本 → [建模师 agent 提案 + 用户确认] → animation-plan.json (frozen)
//        → validate-animation-plan.mjs (real validator, blocking gate)
//        → generate params derived from the plan → real client → mock API
//
// The bracketed step is an LLM decision in production and cannot run in a
// deterministic bench; each case freezes its expected outcome as a fixture
// (the user-confirmed plan). Everything downstream runs for real: the
// validator decides whether generation may proceed, and the mock API records
// exactly what would have been spent. No real GLB generation, no Tripo spend.

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillDir = path.join(repo, "shark-game-assets");
const clientPath = path.join(skillDir, "scripts", "game-assets-mcp.mjs");
const validatorPath = path.join(skillDir, "scripts", "validate-animation-plan.mjs");
const { writeGlb } = await import(path.join(skillDir, "scripts", "glb-tools.mjs"));

const FAKE_GLB = writeGlb({ asset: { version: "2.0" } }, Buffer.alloc(0));
const observed = { requests: [] };
const results = [];

const server = http.createServer((request, response) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    let body;
    try {
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;
    } catch {
      body = undefined;
    }
    const url = new URL(request.url, "http://127.0.0.1");
    observed.requests.push({ method: request.method, path: url.pathname, body });
    if (request.method === "POST" && url.pathname === "/api/asset-jobs") {
      response.writeHead(202, { "content-type": "application/json" });
      response.end(JSON.stringify({ jobId: "job_bench" }));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/asset-jobs/job_bench") {
      const createBody = observed.requests.findLast((entry) => entry.path === "/api/asset-jobs")?.body ?? { assets: [] };
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
    if (request.method === "GET" && url.pathname.startsWith("/dl/")) {
      response.writeHead(200, { "content-type": "model/gltf-binary" });
      response.end(FAKE_GLB);
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "unexpected" }));
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const apiBase = `http://127.0.0.1:${server.address().port}`;

function record(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

function renderPlanTable(plan) {
  const rows = [["角色/实体", "档位", "动作", "触发动作场景描述", "来源", "Preset"]];
  for (const asset of plan.assets) {
    for (const action of asset.actions) {
      rows.push([asset.name, asset.tier, action.name, action.scene, action.source, action.preset ?? "—"]);
    }
  }
  return rows.map((row) => `  | ${row.join(" | ")} |`).join("\n");
}

function runValidator(plan) {
  const work = mkdtempSync(path.join(os.tmpdir(), "script-e2e-plan-"));
  writeFileSync(path.join(work, "animation-plan.json"), JSON.stringify(plan, null, 2));
  return new Promise((resolve) => {
    execFile("node", [validatorPath, "--cwd", work], { timeout: 30000 }, (error, stdout) => {
      let output;
      try {
        output = JSON.parse(stdout);
      } catch {
        output = { status: "failed", errors: [String(stdout).slice(0, 200)] };
      }
      // The validator may have rewritten the plan (budget degradation);
      // downstream derivation must read the enforced version.
      const rewritten = JSON.parse(readFileSync(path.join(work, "animation-plan.json"), "utf8"));
      resolve({ exitCode: error?.code ?? 0, output, rewritten });
    });
  });
}

// SKILL.md step 7 in miniature: derive the generate call from the frozen plan
// (per-asset tripo presets in confirmed order) plus the visual descriptors.
function deriveGenerateParams(gamePrompt, plan, descriptors) {
  return {
    gamePrompt,
    route: "gemini_reference",
    assets: plan.assets.map((asset) => {
      const descriptor = descriptors[asset.id];
      const tripoPresets = asset.actions.filter((action) => action.source === "tripo").map((action) => action.preset);
      return {
        id: asset.id,
        role: descriptor.role,
        name: asset.name,
        assetKind: descriptor.assetKind,
        prompt: descriptor.prompt,
        ...(tripoPresets.length ? { animations: tripoPresets } : {})
      };
    })
  };
}

function runGenerate(params) {
  const work = mkdtempSync(path.join(os.tmpdir(), "script-e2e-run-"));
  return new Promise((resolve) => {
    execFile(
      "node",
      [clientPath, "generate", "--cwd", work, "--params", JSON.stringify({ ...params, cwd: work })],
      { env: { ...process.env, GAME_ASSETS_API_URL: apiBase }, timeout: 60000 },
      (error) => resolve({ exitCode: error?.code ?? 0, work })
    );
  });
}

function confirmedPlan(runId, assets, { confirmed = true } = {}) {
  return {
    version: 1,
    schema: "shark-game-assets-animation-plan",
    runId,
    createdAt: "2026-08-01T10:00:00.000Z",
    budget: { tripoPresetsPerKeyAsset: 3 },
    confirmation: confirmed
      ? { confirmed: true, confirmedBy: "user", confirmedAt: "2026-08-01T10:05:00.000Z" }
      : { confirmed: false, confirmedBy: "user", confirmedAt: "" },
    assets
  };
}

async function runCase({ id, title, script, plan, descriptors, gamePrompt, expect }) {
  observed.requests = [];
  console.log(`\n━━━━ ${id}《${title}》剧本输入 ━━━━`);
  console.log(script.trim().split("\n").map((line) => `  ${line.trim()}`).join("\n"));
  console.log(`── 建模师 agent 动作需求清单（用户确认后的冻结件）──`);
  console.log(renderPlanTable(plan));
  const validation = await runValidator(plan);
  console.log(`── validator ── ${validation.output.status}${validation.output.errors?.length ? `: ${validation.output.errors[0]}` : ` ${JSON.stringify(validation.output.summary)}`}`);
  for (const warning of validation.output.warnings ?? []) console.log(`── 降级警告 ── ${warning}`);

  if (validation.output.status !== "ok") {
    const pass = expect.blocked && observed.requests.length === 0 && validation.output.errors.some((error) => error.includes(expect.blocked));
    record(`${id}: ${expect.label}`, pass, `requests=${observed.requests.length}`);
    return;
  }

  if (expect.degradedContains) {
    const hit = (validation.output.warnings ?? []).some((warning) => warning.includes(expect.degradedContains));
    if (!hit) {
      record(`${id}: ${expect.label}`, false, `expected degradation warning about ${expect.degradedContains}`);
      return;
    }
  }

  const params = deriveGenerateParams(gamePrompt, validation.rewritten, descriptors);
  console.log(`── 派生 generate 上行 ── ${JSON.stringify(params.assets.map((asset) => ({ id: asset.id, animations: asset.animations ?? null })))}`);
  const { exitCode, work } = await runGenerate(params);
  const sent = Object.fromEntries(
    (observed.requests.findLast((entry) => entry.path === "/api/asset-jobs")?.body?.assets ?? []).map((asset) => [asset.id, asset.animations ?? null])
  );
  let clips = {};
  try {
    const manifest = JSON.parse(readFileSync(path.join(work, "asset_manifest.json"), "utf8"));
    clips = Object.fromEntries(manifest.assets.map((asset) => [asset.id, (asset.animationClips ?? []).map((clip) => clip.name)]));
  } catch {
    clips = {};
  }
  console.log(`── 线上观测 ── sent=${JSON.stringify(sent)} localClips=${JSON.stringify(clips)}`);
  const pass = exitCode === 0 && JSON.stringify(sent) === JSON.stringify(expect.sent) && JSON.stringify(clips) === JSON.stringify(expect.clips);
  record(`${id}: ${expect.label}`, pass);
}

// ─────────────────────────────────────────────────────────────────────────────

await runCase({
  id: "S1",
  title: "血月钟楼",
  script: `
    第一幕：侦探艾琳潜入钟楼调查失踪案，沿走廊移动搜集线索；巡逻守卫在走廊往返巡逻。
    第二幕（机关）：地下水牢由一条看门鲨鱼环游巡逻，触碰水面会惊动它。
    第三幕（机关）：身份败露，弩机陷阱击中艾琳令她踉跄；她必须沿钟楼旋转楼梯向上奔逃，
    在钟摆机关摆回之前冲到顶层敲响大钟。`,
  gamePrompt: "血月钟楼：第三人称逃脱，侦探躲避守卫与水牢鲨鱼，沿旋转楼梯逃上钟顶",
  plan: confirmedPlan("blood-moon-tower-01", [
    {
      id: "detective-airin",
      name: "侦探艾琳",
      tier: "key",
      tierReason: "主角，贯穿三幕",
      rigModel: "v1.0-20240301",
      rigType: "biped",
      actions: [
        { name: "walk", source: "tripo", preset: "preset:biped:walk", scene: "第一幕走廊移动搜证" },
        { name: "run_upstairs", source: "tripo", preset: "preset:biped:run_upstairs", scene: "第三幕沿旋转楼梯向上奔逃" },
        { name: "hurt", source: "tripo", preset: "preset:biped:hurt", scene: "第三幕被弩机陷阱击中踉跄" },
        { name: "idle", source: "procedural", scene: "站立待机（运行时程序动画）" }
      ]
    },
    {
      id: "patrol-guard",
      name: "巡逻守卫",
      tier: "secondary",
      tierReason: "重复出现的杂兵，程序化足够",
      rigModel: "v1.0-20240301",
      rigType: "biped",
      actions: [{ name: "walk", source: "procedural", scene: "第一幕走廊往返巡逻" }]
    },
    {
      id: "watch-shark",
      name: "看门鲨鱼",
      tier: "key",
      tierReason: "第二幕水牢机关的核心实体",
      rigModel: "v2.5-20260210",
      rigType: "aquatic",
      actions: [{ name: "march", source: "tripo", preset: "preset:aquatic:march", scene: "第二幕水牢环游巡逻（水生骨骼仅此预设）" }]
    }
  ]),
  descriptors: {
    "detective-airin": { role: "player", assetKind: "character", prompt: "female detective in a trench coat, readable silhouette" },
    "patrol-guard": { role: "hazard", assetKind: "character", prompt: "castle guard with halberd" },
    "watch-shark": { role: "hazard", assetKind: "creature", prompt: "scarred grey watch shark" }
  },
  expect: {
    label: "剧本机关 → 三资产各得其所（3+0+1 preset）",
    sent: {
      "detective-airin": ["preset:biped:walk", "preset:biped:run_upstairs", "preset:biped:hurt"],
      "patrol-guard": null,
      "watch-shark": ["preset:aquatic:march"]
    },
    clips: { "detective-airin": ["walk", "run_upstairs", "hurt"], "patrol-guard": [], "watch-shark": ["march"] }
  }
});

await runCase({
  id: "S2",
  title: "永夜舞会",
  script: `
    吸血鬼女爵在永夜舞会上周旋：赴宴行走、两支宫廷舞、谢幕欢呼。
    （用户在确认时把四个动作全都保留了 —— 超出每关键角色 3 个的 Tripo 预算；
    按确认顺序前 3 个留在 Tripo，第 4 个 cheer 降级到程序化档。）`,
  gamePrompt: "永夜舞会",
  plan: confirmedPlan("eternal-ball-01", [
    {
      id: "vampire-countess",
      name: "吸血鬼女爵",
      tier: "key",
      tierReason: "主角",
      rigModel: "v1.0-20240301",
      rigType: "biped",
      actions: [
        { name: "walk", source: "tripo", preset: "preset:biped:walk", scene: "赴宴行走" },
        { name: "dance_01", source: "tripo", preset: "preset:biped:dance_01", scene: "第一支宫廷舞" },
        { name: "dance_02", source: "tripo", preset: "preset:biped:dance_02", scene: "第二支宫廷舞" },
        { name: "cheer", source: "tripo", preset: "preset:biped:cheer", scene: "谢幕欢呼" }
      ]
    }
  ]),
  descriptors: { "vampire-countess": { role: "player", assetKind: "character", prompt: "vampire countess in a ball gown" } },
  expect: {
    label: "超预算：前 3 个 Tripo 通过，cheer 降级到程序化档",
    degradedContains: "cheer",
    sent: { "vampire-countess": ["preset:biped:walk", "preset:biped:dance_01", "preset:biped:dance_02"] },
    clips: { "vampire-countess": ["walk", "dance_01", "dance_02"] }
  }
});

await runCase({
  id: "S3",
  title: "雾港",
  script: `
    走私船长在雾港码头接头。清单已拟好但用户还没有回复确认 —— 确认门必须拦住生成。`,
  gamePrompt: "雾港接头",
  plan: confirmedPlan(
    "fog-harbor-01",
    [
      {
        id: "smuggler-captain",
        name: "走私船长",
        tier: "key",
        tierReason: "主角",
        rigModel: "v1.0-20240301",
        rigType: "biped",
        actions: [{ name: "walk", source: "tripo", preset: "preset:biped:walk", scene: "码头接头行走" }]
      }
    ],
    { confirmed: false }
  ),
  descriptors: { "smuggler-captain": { role: "player", assetKind: "character", prompt: "smuggler captain" } },
  expect: { label: "未经用户确认的清单被拦截，零上行", blocked: "user confirmation" }
});

await runCase({
  id: "S4",
  title: "渡鸦之王",
  script: `
    终幕机关：渡鸦之王盘旋俯冲袭击钟楼平台。
    （清单误给鸟类骨骼配了 Tripo 动作 —— avian 在目录里没有任何预设，只能程序化。）`,
  gamePrompt: "渡鸦之王 boss 战",
  plan: confirmedPlan("raven-king-01", [
    {
      id: "raven-king",
      name: "渡鸦之王",
      tier: "key",
      tierReason: "终幕 boss",
      rigModel: "v2.5-20260210",
      rigType: "avian",
      actions: [{ name: "dive", source: "tripo", preset: "preset:dive", scene: "盘旋俯冲袭击平台" }]
    }
  ]),
  descriptors: { "raven-king": { role: "hazard", assetKind: "creature", prompt: "giant raven king" } },
  expect: { label: "鸟类骨骼无 Tripo 预设，能力边界拦截", blocked: "no Tripo presets" }
});

await runCase({
  id: "S5",
  title: "晨跑",
  script: `
    极简跑酷：小机器人沿晨光跑道一路向前，没有别的机关 —— 只需要默认的 walk。`,
  gamePrompt: "晨跑跑酷",
  plan: confirmedPlan("morning-run-01", [
    {
      id: "jog-bot",
      name: "小机器人",
      tier: "key",
      tierReason: "唯一角色",
      rigModel: "v1.0-20240301",
      rigType: "biped",
      actions: [
        { name: "walk", source: "tripo", preset: "preset:biped:walk", scene: "沿跑道前进" },
        { name: "idle", source: "procedural", scene: "起点待机" }
      ]
    }
  ]),
  descriptors: { "jog-bot": { role: "player", assetKind: "character", prompt: "small round jogging robot" } },
  expect: {
    label: "极简剧本只花 1 个 preset（walk-only）",
    sent: { "jog-bot": ["preset:biped:walk"] },
    clips: { "jog-bot": ["walk"] }
  }
});

server.close();
const failed = results.filter((result) => !result.pass);
console.log(failed.length ? `\n${failed.length} case(s) failed` : "\nAll cases passed");
assert.equal(failed.length, 0);
