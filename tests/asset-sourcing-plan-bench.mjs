import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSourcingProposal,
  normalizeConfirmedSourcingPlan,
} from "../plugins/asset-center-personal-assets/scripts/sourcing-contract.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skill = path.join(repo, "shark-game-assets");
const validator = path.join(skill, "scripts", "validate-asset-sourcing-plan.mjs");
const deriver = path.join(skill, "scripts", "derive-asset-plans.mjs");
const animationValidator = path.join(skill, "scripts", "validate-animation-plan.mjs");
const sync = path.join(skill, "scripts", "sync-regeneration-status.mjs");
const sample = JSON.parse(readFileSync(path.join(skill, "templates", "asset-sourcing-plan.sample.json"), "utf8"));

function workspace(plan = sample) {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "asset-sourcing-bench-"));
  writeFileSync(path.join(cwd, "asset-sourcing-plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  for (const modelPath of [
    "public/assets/asset-center/speed-bro--ast_speed_bro/model.glb",
    "public/assets/asset-center/speed-run--ast_speed_run/model.glb",
  ]) {
    mkdirSync(path.dirname(path.join(cwd, modelPath)), { recursive: true });
    writeFileSync(path.join(cwd, modelPath), "glb-bytes");
  }
  return cwd;
}

function validate(plan, requireResolved = false) {
  const cwd = workspace(plan);
  return spawnSync(process.execPath, [validator, "--cwd", cwd, ...(requireResolved ? ["--require-resolved"] : [])], { encoding: "utf8" });
}

assert.equal(validate(sample, true).status, 0, "canonical resolved sample must validate");
assert.equal(validate({ ...sample, confirmation: { ...sample.confirmation, confirmed: false } }).status, 1, "unconfirmed plan must fail");

{
  const result = validate(sample);
  const output = JSON.parse(result.stdout);
  assert.equal(output.currentTaskAuthorization, "not_evaluated", "disk validation must never claim current-task authorization");
}

{
  const proposal = buildSourcingProposal({
    runId: "runner-game-01",
    gameSummary: "Two-player airplane obstacle race",
    requirements: [{
      slotId: "runner",
      need: "Shared runner",
      role: "player",
      assetKind: "character",
      model: { defaultSource: "generate_new", confidence: "missing" },
      actions: [{ name: "jump", scene: "Jump over an airplane", defaultSource: "runtime_procedural" }],
    }],
  }, { categories: [] });
  assert.deepEqual(proposal.intentSnapshot, {
    gameSummary: "Two-player airplane obstacle race",
    slots: [{ id: "runner", role: "player", assetKind: "character", actions: ["jump"] }],
  });

  const plan = normalizeConfirmedSourcingPlan(proposal, {
    slots: { runner: { model: { source: "generate_new" }, actions: { jump: { source: "runtime_procedural" } } } },
  }, "2026-08-07T00:00:00.000Z");
  assert.deepEqual(plan.intentSnapshot, proposal.intentSnapshot, "frozen plan must preserve the proposal intent snapshot");
}

{
  const plan = structuredClone(sample);
  plan.slots[0].actions[0].parentAssetId = "ast_other";
  assert.equal(validate(plan).status, 1, "linked action parent must match selected base");
}
{
  const plan = structuredClone(sample);
  delete plan.slots[0].model.resolved.sha256;
  assert.equal(validate(plan, true).status, 1, "Asset Center reuse requires immutable metadata");
}
{
  const plan = structuredClone(sample);
  plan.slots[0].actions[0] = {
    name: "run",
    scene: "Shift 加速移动",
    source: "reuse_compatible_action",
    assetId: "ast_other_run",
    compatibility: { status: "unverified" },
  };
  assert.equal(validate(plan).status, 1, "compatible reuse requires verified evidence");
}
{
  const plan = structuredClone(sample);
  plan.slots[0].model.resolved.modelPath = "https://signed.example/model.glb?token=secret";
  assert.equal(validate(plan).status, 1, "persisted signed URLs must fail");
}

const cwd = workspace(sample);
execFileSync(process.execPath, [deriver, "--cwd", cwd], { encoding: "utf8" });
const regeneration = JSON.parse(readFileSync(path.join(cwd, "regeneration-plan.json"), "utf8"));
const animation = JSON.parse(readFileSync(path.join(cwd, "animation-plan.json"), "utf8"));
const generation = JSON.parse(readFileSync(path.join(cwd, "asset-generation-request.json"), "utf8"));

assert.deepEqual(generation.assets.map((asset) => asset.id), ["patrol-guard", "energy-crystal"]);
assert.deepEqual(generation.actionJobs.map((job) => job.assetId), ["patrol-guard"]);
assert.equal(regeneration.items.find((item) => item.id === "player-loan").runtimeUrl, "/assets/asset-center/speed-bro--ast_speed_bro/model.glb");
assert.equal(regeneration.items.find((item) => item.id === "player-loan").actions[0].runtimeUrl, "/assets/asset-center/speed-run--ast_speed_run/model.glb");
assert.equal(animation.assets[0].actions.find((action) => action.name === "run").source, "asset_center");
assert.equal(animation.confirmation.confirmedAt, sample.confirmation.confirmedAt);
assert.equal(generation.runId, sample.runId);
const animationResult = spawnSync(process.execPath, [animationValidator, "--cwd", cwd], { encoding: "utf8" });
assert.equal(animationResult.status, 0, `derived reused actions must validate: ${animationResult.stdout}${animationResult.stderr}`);
execFileSync(process.execPath, [sync, "--cwd", cwd], { encoding: "utf8" });
const status = JSON.parse(readFileSync(path.join(cwd, "public", "regeneration-status.json"), "utf8"));
const reusedPlayer = status.items.find((item) => item.id === "player-loan");
assert.equal(reusedPlayer.status, "ready", "reused model under /assets must be ready immediately");
assert.equal(reusedPlayer.clips.find((clip) => clip.name === "run").status, "ready", "reused linked action must be ready immediately");
assert.equal(status.items.find((item) => item.id === "patrol-guard").status, "pending", "generated gap stays pending");

process.stdout.write("asset sourcing plan bench passed\n");
