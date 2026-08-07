import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = path.join(repo, "plugins", "asset-center-personal-assets");
const marketplace = JSON.parse(readFileSync(path.join(repo, ".agents", "plugins", "marketplace.json"), "utf8"));
const manifest = JSON.parse(readFileSync(path.join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
const mcp = JSON.parse(readFileSync(path.join(pluginRoot, ".mcp.json"), "utf8"));
const bootstrap = readFileSync(path.join(pluginRoot, "scripts", "plugin-bootstrap.mjs"), "utf8");
const server = readFileSync(path.join(pluginRoot, "scripts", "asset-center-personal-assets-mcp.mjs"), "utf8");

assert.equal(marketplace.name, "sharky-3d-assets");
assert.equal(marketplace.plugins[0].source.path, "./plugins/asset-center-personal-assets");
assert.equal(manifest.name, "asset-center-personal-assets");
assert.equal(manifest.version, "0.4.1");
assert.deepEqual(mcp.mcpServers.asset_center_personal_assets.args, ["./scripts/plugin-bootstrap.mjs"]);
assert.match(bootstrap, /resolveMcpServer/);
assert.match(server, /SERVER_VERSION = "0\.4\.1"/);

process.stdout.write("plugin package bench passed\n");
