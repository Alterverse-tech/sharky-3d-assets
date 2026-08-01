import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillDir = path.join(repo, "shark-game-assets");
const validator = path.join(skillDir, "scripts", "validate-animation-plan.mjs");
const catalog = JSON.parse(readFileSync(path.join(skillDir, "scripts", "preset-catalog.json"), "utf8"));
const client = readFileSync(path.join(skillDir, "scripts", "game-assets-mcp.mjs"), "utf8");
const skill = readFileSync(path.join(skillDir, "SKILL.md"), "utf8");
const samplePlan = JSON.parse(readFileSync(path.join(skillDir, "templates", "animation-plan.sample.json"), "utf8"));

// Catalog invariants: full biped library present, creature limits honest.
const v1Biped = catalog.rigModels["v1.0-20240301"].rigTypes.biped;
assert.ok(v1Biped.length >= 90, `v1.0 biped catalog should carry the 90+ preset library, got ${v1Biped.length}`);
for (const preset of ["preset:biped:walk", "preset:biped:climb", "preset:biped:run_upstairs", "preset:biped:hurt"]) {
  assert.ok(v1Biped.includes(preset), `v1.0 biped catalog missing ${preset}`);
}
assert.deepEqual(catalog.rigModels["v2.5-20260210"].rigTypes.aquatic, ["preset:aquatic:march"]);
assert.deepEqual(catalog.rigModels["v2.5-20260210"].rigTypes.avian, []);
const categorized = new Set(Object.values(catalog.categories).flat());
for (const preset of v1Biped) assert.ok(categorized.has(preset), `${preset} missing from category grouping`);
assert.equal(categorized.size, v1Biped.length, "categories must cover exactly the v1.0 biped library");

// Client invariants: walk-only default stays pinned; whitelist is catalog-driven.
assert.match(client, /const DEFAULT_BIPED_RIG_CLIPS = \["preset:biped:walk"\];/);
assert.ok(client.includes("preset-catalog.json"), "client must load the preset catalog");
assert.doesNotMatch(client, /const BIPED_RIG_CLIPS = \[/, "hardcoded whitelist should be replaced by the catalog");
assert.ok(client.includes("normalizeGenerateAnimations"), "generate path must forward confirmed per-asset animations");
assert.ok(skill.includes("assets[].animations") || skill.includes("`animations`"), "SKILL.md must document the generate-call animations pass-through");

// Skill doc invariants: the confirmation gate exists and keeps its contract.
assert.ok(skill.includes("## Action requirements confirmation (animation planning gate)"), "SKILL.md missing the gate section");
assert.ok(skill.includes("触发动作场景描述"), "SKILL.md gate table must include the scene column");
assert.ok(skill.includes("validate-animation-plan.mjs"), "SKILL.md must reference the plan validator");

function runValidator(plan) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "animation-plan-bench-"));
  writeFileSync(path.join(dir, "animation-plan.json"), JSON.stringify(plan, null, 2));
  const result = spawnSync(process.execPath, [validator, "--cwd", dir], { encoding: "utf8" });
  const rewritten = JSON.parse(readFileSync(path.join(dir, "animation-plan.json"), "utf8"));
  return { status: result.status, output: `${result.stdout}${result.stderr}`, rewritten };
}

function clonePlan(mutate) {
  const plan = JSON.parse(JSON.stringify(samplePlan));
  mutate?.(plan);
  return plan;
}

// The bundled sample must validate cleanly.
const ok = runValidator(clonePlan());
assert.equal(ok.status, 0, `sample plan should pass: ${ok.output}`);

// Unconfirmed plans are blocked.
assert.equal(runValidator(clonePlan((plan) => { plan.confirmation.confirmed = false; })).status, 1, "unconfirmed plan must fail");
assert.equal(runValidator(clonePlan((plan) => { delete plan.confirmation; })).status, 1, "missing confirmation must fail");

// Budget rules: overruns degrade to procedural (confirmed order wins) instead
// of failing; the plan file is rewritten with explicit degraded markers.
{
  const overBudget = runValidator(clonePlan((plan) => {
    plan.assets[0].actions.push(
      { name: "slash", source: "tripo", preset: "preset:biped:slash", scene: "决斗" },
      { name: "shoot", source: "tripo", preset: "preset:biped:shoot", scene: "远程反击" }
    );
  }));
  assert.equal(overBudget.status, 0, `over-budget key asset should degrade, not fail: ${overBudget.output}`);
  assert.ok(overBudget.output.includes("degraded to procedural"), "over-budget run must warn about the degradation");
  const detectiveActions = overBudget.rewritten.assets[0].actions;
  assert.equal(detectiveActions.filter((action) => action.source === "tripo").length, 3, "only the first 3 tripo actions stay on Tripo");
  const slash = detectiveActions.find((action) => action.name === "slash");
  assert.equal(slash.source, "procedural");
  assert.equal(slash.degraded?.from, "tripo");
  assert.equal(slash.degraded?.preset, "preset:biped:slash");
  assert.ok(!("preset" in slash), "degraded action must not keep a live preset");
}
{
  const secondaryTripo = runValidator(clonePlan((plan) => {
    plan.assets[1].actions[0] = { name: "walk", source: "tripo", preset: "preset:biped:walk", scene: "巡逻" };
  }));
  assert.equal(secondaryTripo.status, 0, `secondary tripo should degrade, not fail: ${secondaryTripo.output}`);
  const guardWalk = secondaryTripo.rewritten.assets[1].actions[0];
  assert.equal(guardWalk.source, "procedural");
  assert.equal(guardWalk.degraded?.from, "tripo");
}

// Catalog membership and required fields.
assert.equal(
  runValidator(clonePlan((plan) => {
    plan.assets[0].actions[0].preset = "preset:biped:moonwalk";
  })).status,
  1,
  "preset outside the catalog must fail"
);
assert.equal(
  runValidator(clonePlan((plan) => {
    plan.assets[2].actions[0].preset = "preset:biped:walk";
  })).status,
  1,
  "biped preset on an aquatic rig must fail"
);
assert.equal(
  runValidator(clonePlan((plan) => {
    delete plan.assets[0].actions[1].scene;
  })).status,
  1,
  "missing scene description must fail"
);

process.stdout.write("animation plan bench passed\n");
