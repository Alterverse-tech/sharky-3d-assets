import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skill = readFileSync(path.join(repo, "shark-game-assets", "SKILL.md"), "utf8");
const reference = readFileSync(path.join(repo, "shark-game-assets", "references", "regeneration-preview.md"), "utf8");

assert.match(skill, /verified preview link delivery/i);
assert.match(reference, /Only an HTTP `200` response permits link delivery/);
assert.match(reference, /素材预览：\[http:\/\/127\.0\.0\.1:<port>\/regeneration\.html\]\(http:\/\/127\.0\.0\.1:<port>\/regeneration\.html\)/);
assert.match(reference, /first progress update after that verification/i);
assert.match(reference, /final user-facing handoff/i);
assert.match(reference, /preview is temporarily unavailable/i);

process.stdout.write("preview link delivery bench passed\n");
