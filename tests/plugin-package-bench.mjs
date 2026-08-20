import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = path.join(repo, "plugins", "asset-center-personal-assets");
const marketplace = JSON.parse(readFileSync(path.join(repo, ".agents", "plugins", "marketplace.json"), "utf8"));
const claudeMarketplace = JSON.parse(readFileSync(path.join(repo, ".claude-plugin", "marketplace.json"), "utf8"));
const manifest = JSON.parse(readFileSync(path.join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
const claudeManifest = JSON.parse(readFileSync(path.join(pluginRoot, ".claude-plugin", "plugin.json"), "utf8"));
const mcp = JSON.parse(readFileSync(path.join(pluginRoot, ".mcp.json"), "utf8"));
const bootstrap = readFileSync(path.join(pluginRoot, "scripts", "plugin-bootstrap.mjs"), "utf8");
const server = readFileSync(path.join(pluginRoot, "scripts", "asset-center-personal-assets-mcp.mjs"), "utf8");

assert.equal(marketplace.name, "sharky-3d-assets");
assert.equal(marketplace.plugins[0].source.path, "./plugins/asset-center-personal-assets");
assert.equal(manifest.name, "asset-center-personal-assets");
assert.equal(manifest.version, "0.5.1");
assert.deepEqual(mcp.mcpServers.asset_center_personal_assets.args, ["./scripts/plugin-bootstrap.mjs"]);
assert.equal(claudeMarketplace.name, "sharky-3d-assets");
assert.equal(claudeMarketplace.plugins[0].name, "asset-center-personal-assets");
assert.equal(claudeMarketplace.plugins[0].source, "./plugins/asset-center-personal-assets");
assert.equal(claudeMarketplace.plugins[0].version, manifest.version);
assert.equal(claudeManifest.name, "asset-center-personal-assets");
assert.equal(claudeManifest.version, manifest.version);
assert.deepEqual(claudeManifest.mcpServers.asset_center_personal_assets.args, ["${CLAUDE_PLUGIN_ROOT}/scripts/plugin-bootstrap.mjs"]);
const claudeSkillManifest = JSON.parse(readFileSync(path.join(repo, "shark-game-assets", ".claude-plugin", "plugin.json"), "utf8"));
assert.equal(claudeMarketplace.plugins[1].name, "shark-game-assets");
assert.equal(claudeMarketplace.plugins[1].source, "./shark-game-assets");
assert.equal(claudeSkillManifest.name, "shark-game-assets");
assert.match(bootstrap, /resolveMcpServer/);
assert.match(server, /SERVER_VERSION = "0\.5\.1"/);

const characterRoot = path.join(repo, "plugins", "asset-center-character-workflow");
const characterCodexManifest = JSON.parse(readFileSync(path.join(characterRoot, ".codex-plugin", "plugin.json"), "utf8"));
const characterClaudeManifest = JSON.parse(readFileSync(path.join(characterRoot, ".claude-plugin", "plugin.json"), "utf8"));
const characterMcp = JSON.parse(readFileSync(path.join(characterRoot, ".mcp.json"), "utf8"));
const characterServer = readFileSync(path.join(characterRoot, "scripts", "asset-center-character-workflow-mcp.mjs"), "utf8");
const characterSkill = readFileSync(
  path.join(characterRoot, "skills", "asset-center-character-workflow", "SKILL.md"),
  "utf8"
);

assert.equal(characterCodexManifest.name, "asset-center-character-workflow");
assert.equal(characterClaudeManifest.name, "asset-center-character-workflow");
assert.equal(characterClaudeManifest.version, characterCodexManifest.version);
assert.deepEqual(characterMcp.mcpServers.asset_center_character_workflow.args, [
  "./scripts/asset-center-character-workflow-mcp.mjs"
]);
assert.deepEqual(characterClaudeManifest.mcpServers.asset_center_character_workflow.args, [
  "${CLAUDE_PLUGIN_ROOT}/scripts/asset-center-character-workflow-mcp.mjs"
]);
assert.match(characterServer, new RegExp(`SERVER_VERSION = "${characterCodexManifest.version.replaceAll(".", "\\.")}"`));
assert.ok(
  characterSkill.includes(`This loaded bundle is version \`${characterCodexManifest.version}\`.`),
  "character SKILL.md must state the packaged bundle version"
);
assert.ok(!characterSkill.includes("asset-center-local"), "character SKILL.md must point update checks at sharky-3d-assets");
assert.ok(characterSkill.includes("asset-center-character-workflow@sharky-3d-assets"));

const characterAgentsEntry = marketplace.plugins.find((entry) => entry.name === "asset-center-character-workflow");
assert.ok(characterAgentsEntry, "Codex marketplace must list asset-center-character-workflow");
assert.equal(characterAgentsEntry.source.path, "./plugins/asset-center-character-workflow");
assert.equal(
  characterAgentsEntry.version,
  characterCodexManifest.version,
  "Codex marketplace entry must carry the version the SKILL.md update check reads"
);
const characterClaudeEntry = claudeMarketplace.plugins.find((entry) => entry.name === "asset-center-character-workflow");
assert.ok(characterClaudeEntry, "Claude marketplace must list asset-center-character-workflow");
assert.equal(characterClaudeEntry.source, "./plugins/asset-center-character-workflow");
assert.equal(characterClaudeEntry.version, characterCodexManifest.version);

const install = readFileSync(path.join(repo, "INSTALL.md"), "utf8");
assert.ok(install.includes("codex plugin add asset-center-character-workflow@sharky-3d-assets --json"));
assert.ok(install.includes("claude plugin install asset-center-character-workflow@sharky-3d-assets"));
const repoReadme = readFileSync(path.join(repo, "README.md"), "utf8");
assert.ok(repoReadme.includes("codex plugin add asset-center-character-workflow@sharky-3d-assets"));
assert.ok(repoReadme.includes("claude plugin install asset-center-character-workflow@sharky-3d-assets"));
assert.ok(repoReadme.includes("## Components and boundaries"));
assert.ok(repoReadme.includes("docs/img/component-boundaries.svg"), "boundaries section must embed the relationship diagram");
const widget = readFileSync(path.join(pluginRoot, "web", "src", "AssetSourcingBoard.tsx"), "utf8");
const bridge = readFileSync(path.join(pluginRoot, "web", "src", "bridge.ts"), "utf8");
const bundle = readFileSync(path.join(pluginRoot, "web", "dist", "asset-sourcing-board.js"), "utf8");
assert.match(widget, /全屏查看/);
assert.match(widget, /退出全屏/);
assert.match(widget, /刷新资产/);
assert.match(widget, /candidate: `复用素材: \$\{entry\.displayName\}\(点击预览\)`/);
assert.match(widget, /candidate: "使用three\.js程序生成"/);
assert.doesNotMatch(widget, /Asset Center 候选：/);
assert.doesNotMatch(widget, /Three\.js \$\{slot\.name\}基础模型/);
assert.match(widget, /<th>选项<\/th>\s*<th>当前选择<\/th>\s*<th>候选方案（点击预览）<\/th>/);
assert.match(widget, /<td className="option-cell">[\s\S]*?<td className="selection-cell">[\s\S]*?<td className="candidate-cell">/);
assert.match(bridge, /ui\/request-display-mode/);
assert.match(widget, /href=\{row\.previewUrl\}\s*target="_blank"\s*rel="noreferrer"/);
assert.match(widget, /entityLabel/);
assert.doesNotMatch(widget, /return slot\.tier \?/);
assert.doesNotMatch(widget, /PreviewChoice|openHostLink|event\.preventDefault\(\)/);
assert.doesNotMatch(bridge, /openHostLink|ui\/open-link|openExternal|requestCodexPreview/);
assert.doesNotMatch(bundle, /ui\/open-link|openExternal|在 Codex 中打开|在系统浏览器打开/);
assert.match(bundle, /ui\/request-display-mode/);

process.stdout.write("plugin package bench passed\n");
