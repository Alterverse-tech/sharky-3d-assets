import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skill = readFileSync(path.join(repo, "shark-game-assets", "SKILL.md"), "utf8");
const readme = readFileSync(path.join(repo, "README.md"), "utf8");

const ordered = [
  "extract model/action requirements",
  "inspect current project imports",
  "list Asset Center catalog once",
  "build sourcing proposal",
  "render fullscreen progressive sourcing board",
  "wait for one final confirmation",
  "write and validate asset-sourcing-plan.json",
  "pull only selected reuse_asset_center items",
  "derive plans",
  "generate only asset-generation-request.json gaps",
];
let previous = -1;
for (const phrase of ordered) {
  const index = skill.indexOf(phrase);
  assert.ok(index > previous, `SKILL.md missing or misordered sourcing gate phrase: ${phrase}`);
  previous = index;
}

assert.ok(skill.includes("库存查询失败/暂不可用"), "catalog failure must not be described as an empty library");
assert.ok(skill.includes("Plugin bootstrap owns its startup and update check"), "Skill must keep the Plugin startup boundary explicit");
assert.ok(skill.includes("validate-asset-sourcing-plan.mjs"));
assert.ok(skill.includes("derive-asset-plans.mjs"));
assert.ok(skill.includes("source: \"asset_center\"") && skill.includes("source: \"project\""), "reused animation sources must be documented");
assert.ok(readme.includes("Reuse before generate"));
assert.ok(readme.includes("fullscreen MCP App"));
assert.ok(readme.includes("codex plugin marketplace add Alterverse-tech/sharky-3d-assets --ref main"));
assert.ok(readme.includes("asset-center-personal-assets@sharky-3d-assets"));

process.stdout.write("asset sourcing docs bench passed\n");
