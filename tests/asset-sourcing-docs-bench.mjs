import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skill = readFileSync(path.join(repo, "shark-game-assets", "SKILL.md"), "utf8");
const pluginSkill = readFileSync(path.join(repo, "plugins", "asset-center-personal-assets", "skills", "asset-center-personal-assets", "SKILL.md"), "utf8");
const readme = readFileSync(path.join(repo, "README.md"), "utf8");

const ordered = [
  "extract model/action requirements",
  "inspect current project imports",
  "list Asset Center catalog once",
  "build sourcing proposal",
  "render business sourcing table",
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

assert.ok(skill.includes("A failed query is not an empty library"), "catalog failure must not be described as an empty library");
assert.ok(skill.includes("Plugin bootstrap owns its startup and update check"), "Skill must keep the Plugin startup boundary explicit");
assert.ok(skill.includes("Asset Center Plugin 未安装"), "missing Plugin must produce a clear one-time prompt");
assert.ok(skill.includes("never present a primitive-only prototype as the completed game"), "named-entity games must not be delivered as primitive-only prototypes");
assert.ok(skill.includes("canonical preview/progress, GLB generation or reuse, manifest update, and GLTF integration"), "the completed-game contract must require the full asset workflow");
assert.ok(skill.includes("Asset Center Plugin 会将你历史制作的模型云端保存"), "Plugin prompt must explain the asset-reuse value");
assert.ok(skill.includes("https://github.com/Alterverse-tech/sharky-3d-assets"), "Plugin prompt must link to the Asset Center repository");
assert.ok(skill.includes("codex plugin marketplace add Alterverse-tech/sharky-3d-assets --ref main"));
assert.ok(skill.includes("codex plugin add asset-center-personal-assets@sharky-3d-assets"));
assert.ok(skill.includes("Only run installation commands after explicit confirmation"), "Plugin installation must require consent");
assert.ok(skill.includes("The user-chosen \"install\" action authorizes those commands now"), "install flow must execute immediately after confirmation");
assert.ok(skill.includes("Never silently treat installation failure as installed"), "installation failure must not be silently ignored");
assert.ok(skill.includes("start a new Codex thread"), "newly installed Plugin needs a new-thread boundary");
assert.ok(skill.includes("https://studio.13-216-49-19.sslip.io/asset-center/characters/new"), "character gaps must link to the Asset Center designer");
assert.ok(skill.includes("validate-asset-sourcing-plan.mjs"));
assert.ok(skill.includes("derive-asset-plans.mjs"));
assert.ok(skill.includes("source: \"asset_center\"") && skill.includes("source: \"project\""), "reused animation sources must be documented");
assert.ok(readme.includes("Reuse before generate"));
assert.ok(readme.includes("complete ten-column asset confirmation table"));
assert.ok(readme.includes("codex plugin marketplace add Alterverse-tech/sharky-3d-assets --ref main"));
assert.ok(readme.includes("asset-center-personal-assets@sharky-3d-assets"));
assert.ok(readme.includes("设计人物资产"));

for (const document of [skill, pluginSkill]) {
  assert.ok(document.includes("active_same_task"), "skill must define the active current-task intent state");
  assert.ok(document.includes("related_history"), "skill must allow related history only as prefill context");
  assert.ok(document.includes("unrelated_history"), "skill must reject unrelated game history");
  assert.ok(document.includes("uncertain"), "skill must fail closed when intent relevance is uncertain");
  assert.ok(document.includes("Never use confirmation metadata read from the workspace"), "disk confirmation must not satisfy the live gate");
}
assert.ok(readme.includes("Historical asset plans are selection snapshots, not current-task authorization"));

process.stdout.write("asset sourcing docs bench passed\n");
