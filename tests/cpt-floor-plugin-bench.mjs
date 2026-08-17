import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.join(repo, "plugins", "cpt-floor");
const json = (file) => JSON.parse(readFileSync(file, "utf8"));

const codex = json(path.join(root, ".codex-plugin", "plugin.json"));
const claude = json(path.join(root, ".claude-plugin", "plugin.json"));
const codexMarket = json(path.join(repo, ".agents", "plugins", "marketplace.json"));
const claudeMarket = json(path.join(repo, ".claude-plugin", "marketplace.json"));

assert.equal(codex.name, "cpt-floor");
assert.equal(codex.version, "0.1.0");
assert.equal(codex.skills, "./skills/");
assert.equal(claude.name, codex.name);
assert.equal(claude.version, codex.version);

const cm = codexMarket.plugins.find((entry) => entry.name === "cpt-floor");
assert.ok(cm, "Codex marketplace must list cpt-floor");
assert.equal(cm.source.path, "./plugins/cpt-floor");
assert.equal(cm.version, "0.1.0");
assert.equal(cm.policy.installation, "AVAILABLE");
assert.equal(cm.policy.authentication, "ON_INSTALL");

const am = claudeMarket.plugins.find((entry) => entry.name === "cpt-floor");
assert.ok(am, "Claude marketplace must list cpt-floor");
assert.equal(am.source, "./plugins/cpt-floor");
assert.equal(am.version, "0.1.0");

const skill = readFileSync(path.join(root, "skills", "cpt-floor", "SKILL.md"), "utf8");
const openai = readFileSync(path.join(root, "skills", "cpt-floor", "agents", "openai.yaml"), "utf8");
const reference = readFileSync(path.join(root, "references", "floor-authoring.md"), "utf8");

assert.match(skill, /^---\nname: cpt-floor\ndescription: Use when /);
assert.match(skill, /scripts\/bootstrap\.mjs/);
assert.match(skill, /FLOOR-AUTHORING\.md/);
assert.match(skill, /tools\/validate\.mjs/);
assert.match(skill, /scripts\/verify-preview\.mjs/);
assert.match(skill, /explicit|明确|直接授权/i);
assert.match(skill, /\.floor-token/);
assert.doesNotMatch(skill, /TBD|TODO|\[TODO/);
assert.ok(skill.split("\n").length < 500);
assert.match(openai, /default_prompt: "Use \$cpt-floor /);
assert.match(reference, /floors\/\*\.js/);

process.stdout.write("cpt-floor plugin bench passed\n");
