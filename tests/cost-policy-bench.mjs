import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const client = await readFile(path.join(repo, "shark-game-assets", "scripts", "game-assets-mcp.mjs"), "utf8");
const skill = await readFile(path.join(repo, "shark-game-assets", "SKILL.md"), "utf8");
const promptRule =
  'Write concise English asset prompts describing the subject, identity-defining shape, proportions, materials, colors, and gameplay role. Preserve the visual style from the user or game specification. Do not add "simple", "low-poly", "stylized", or "cartoon" unless that style was requested. Favor a single fully visible subject, readable silhouette, clean separation of major forms, and no background, text, logo, watermark, unrelated props, duplicate parts, or extra characters.';

assert.match(client, /const DEFAULT_BIPED_RIG_CLIPS = \["preset:biped:walk"\];/);
assert.match(client, /\{ animations: DEFAULT_BIPED_RIG_CLIPS, preset: DEFAULT_BIPED_RIG_CLIPS\.join\(","\) \}/);
assert.doesNotMatch(client, /\{ animations: undefined, preset: DEFAULT_BIPED_RIG_CLIPS/);
assert.ok(client.includes(promptRule), "tool schema should carry the shared neutral asset prompt rule");
assert.ok(skill.includes(promptRule), "skill should carry the shared neutral asset prompt rule");

process.stdout.write("cost policy bench passed\n");
