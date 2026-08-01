// Verifies the markdown mirror of the confirmed action requirements table:
// when animation-plan.json exists, sync-regeneration-status.mjs maintains
// animation-plan-progress.md with a live per-row status column, overwriting
// the file as clips land on disk.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sync = path.join(repo, "shark-game-assets", "scripts", "sync-regeneration-status.mjs");

const work = mkdtempSync(path.join(os.tmpdir(), "plan-progress-bench-"));
const generated = path.join(work, "public", "generated-assets");
mkdirSync(generated, { recursive: true });

writeFileSync(
  path.join(work, "regeneration-plan.json"),
  JSON.stringify({
    version: 1,
    runId: "bench-run",
    startedAt: "",
    items: [{ id: "hero", name: "守夜人", role: "player", actions: ["walk", "run_upstairs"] }]
  })
);
writeFileSync(
  path.join(work, "animation-plan.json"),
  JSON.stringify({
    version: 1,
    schema: "shark-game-assets-animation-plan",
    runId: "bench-run",
    budget: { tripoPresetsPerKeyAsset: 3 },
    confirmation: { confirmed: true, confirmedBy: "user", confirmedAt: "2026-08-01T10:00:00.000Z" },
    assets: [
      {
        id: "hero",
        name: "守夜人",
        tier: "key",
        rigModel: "v1.0-20240301",
        rigType: "biped",
        actions: [
          { name: "walk", source: "tripo", preset: "preset:biped:walk", scene: "底层巡视" },
          { name: "run_upstairs", source: "tripo", preset: "preset:biped:run_upstairs", scene: "警铃后沿旋转楼梯紧急登顶" },
          { name: "idle", source: "procedural", scene: "停步观察" }
        ]
      }
    ]
  })
);

// Round 1: base model + walk clip exist on disk; run_upstairs still pending.
writeFileSync(path.join(generated, "hero.glb"), "glb-bytes");
writeFileSync(path.join(generated, "hero-walk.glb"), "glb-bytes");
execFileSync(process.execPath, [sync, "--cwd", work], { encoding: "utf8" });

const round1 = readFileSync(path.join(work, "animation-plan-progress.md"), "utf8");
console.log("── round 1 (walk 落盘, run_upstairs 未完成) ──");
console.log(round1);
const row = (source, name) => source.split("\n").find((line) => line.includes(`| ${name} |`));
assert.ok(row(round1, "（基础模型）").includes("✅"), "base model row should be ✅");
assert.ok(row(round1, "walk").includes("✅"), "walk row should be ✅");
assert.ok(row(round1, "run_upstairs").includes("⬜"), "run_upstairs row should still be ⬜");
assert.ok(row(round1, "idle").includes("✅ 运行时"), "procedural idle row shows 运行时");
assert.ok(round1.includes("preset:biped:run_upstairs"), "table keeps the preset column");
assert.ok(round1.includes("警铃后沿旋转楼梯紧急登顶"), "table keeps the scene column");
assert.ok(row(round1, "walk").includes("`/generated-assets/hero-walk.glb`"), "walk row carries the download url");
assert.ok(row(round1, "walk").includes("`public/generated-assets/hero-walk.glb`"), "walk row carries the local path");
assert.ok(round1.includes("## 缺口回顾"), "review section exists");
assert.ok(round1.includes("⬜ 守夜人 / run_upstairs"), "pending run_upstairs is listed as a gap");

// Round 2: run_upstairs clip lands; the file must be overwritten with ✅.
writeFileSync(path.join(generated, "hero-run_upstairs.glb"), "glb-bytes");
execFileSync(process.execPath, [sync, "--cwd", work], { encoding: "utf8" });
const round2 = readFileSync(path.join(work, "animation-plan-progress.md"), "utf8");
console.log("── round 2 (run_upstairs 落盘后覆盖更新) ──");
console.log(row(round2, "run_upstairs"));
assert.ok(row(round2, "run_upstairs").includes("✅"), "run_upstairs row should flip to ✅ after the clip lands");
assert.notEqual(round1, round2, "file must be overwritten in place");
assert.ok(round2.includes("全部计划条目已落地，无缺口"), "review section reports no gaps when everything landed");

// Round 3: with --base-url, download cells render as clickable full links.
// (Status is unchanged since round 2, so remove the md to exercise the
// missing-file rebuild path — in real use --base-url is passed from the start.)
rmSync(path.join(work, "animation-plan-progress.md"));
execFileSync(process.execPath, [sync, "--cwd", work, "--base-url", "http://127.0.0.1:4173"], { encoding: "utf8" });
const round3 = readFileSync(path.join(work, "animation-plan-progress.md"), "utf8");
assert.ok(
  round3.includes("[hero-walk.glb](http://127.0.0.1:4173/generated-assets/hero-walk.glb)"),
  "base-url renders clickable download links"
);
console.log("── round 3 (--base-url 可点击链接) ──");
console.log(row(round3, "walk"));

console.log("plan progress bench passed");
