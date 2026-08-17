# CPT Floor Public Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish one `cpt-floor` marketplace plugin whose single `$cpt-floor` skill takes Codex and Claude Code users from no developer kit to a validated, working floor preview, with publishing behind explicit authorization.

**Architecture:** The plugin is an independent, dependency-free marketplace package. A deterministic bootstrap CLI owns registry checks, safe kit acquisition, workspace reuse, and floor scaffolding; a second deterministic CLI owns local preview-server selection and readiness checks. The Skill orchestrates those scripts and the downloaded kit's own authoring, validation, and publishing tools.

**Tech Stack:** Node.js ES modules and built-in APIs, system `tar`, Markdown Agent Skill, Codex/Claude plugin manifests, Node assertion benches.

## Global Constraints

- Expose the same skill name, `$cpt-floor`, in Codex and Claude Code.
- Use plugin version `0.1.0` for the initial public release.
- Do not bundle the tower game or a frozen developer kit; fetch the current kit from `https://cpt-tower.13-216-49-19.sslip.io/kit.tar.gz` by default.
- Default new workspaces to `~/CPT-Tower-Floors/<floor>-<key>` and reuse the current directory only when it is a valid kit workspace.
- Fetch `/api/registry` before mutating a workspace and stop on a known floor conflict.
- Never overwrite `floors/*.js`, `floors/registry.json`, or `.floor-token` during kit refresh.
- Reject archive absolute paths, `..` traversal, links, and entries outside `cpt-floor-kit/` before extraction.
- Do not show a preview URL until the preview root and exact floor module both return HTTP 200 and the served module matches the local file.
- Do not claim, publish, or roll back until the user gives an explicit instruction for that production mutation.
- Never print, commit, or copy `.floor-token` contents into prompts or documentation.
- Tests must not call production claim, publish, or rollback endpoints.
- Do not add MCP, UI, account, or new tower API code.

---

## File map

**Create:**

- `plugins/cpt-floor/.codex-plugin/plugin.json` — Codex package metadata.
- `plugins/cpt-floor/.claude-plugin/plugin.json` — Claude Code package metadata.
- `plugins/cpt-floor/scripts/bootstrap.mjs` — safe kit/workspace/scaffold CLI.
- `plugins/cpt-floor/scripts/verify-preview.mjs` — port selection, dev-server start/reuse, and readiness CLI.
- `plugins/cpt-floor/skills/cpt-floor/SKILL.md` — the single user-facing workflow.
- `plugins/cpt-floor/skills/cpt-floor/agents/openai.yaml` — Codex UI metadata.
- `plugins/cpt-floor/references/floor-authoring.md` — compact orchestration and failure-recovery reference.
- `tests/cpt-floor-plugin-bench.mjs` — manifests, marketplace, Skill, and public-doc contract.
- `tests/cpt-floor-bootstrap-bench.mjs` — safe setup and protected-file regression bench.
- `tests/cpt-floor-preview-bench.mjs` — preview port/reuse/readiness regression bench.

**Modify:**

- `.agents/plugins/marketplace.json` — append the Codex marketplace entry.
- `.claude-plugin/marketplace.json` — append the Claude Code marketplace entry.
- `README.md` — add both installation commands and one `$cpt-floor` example.

---

### Task 1: Cross-runtime plugin package and marketplace registration

**Files:**

- Create: `tests/cpt-floor-plugin-bench.mjs`
- Create: `plugins/cpt-floor/.codex-plugin/plugin.json`
- Create: `plugins/cpt-floor/.claude-plugin/plugin.json`
- Modify: `.agents/plugins/marketplace.json`
- Modify: `.claude-plugin/marketplace.json`

**Interfaces:**

- Consumes: the repository's existing plugin and marketplace conventions.
- Produces: plugin identity `cpt-floor@0.1.0` at `./plugins/cpt-floor` for both runtimes.

- [ ] **Step 1: Write the failing package bench**

Create `tests/cpt-floor-plugin-bench.mjs` with these assertions:

```js
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

const cm = codexMarket.plugins.find((x) => x.name === "cpt-floor");
assert.equal(cm.source.path, "./plugins/cpt-floor");
assert.equal(cm.version, "0.1.0");
assert.equal(cm.policy.installation, "AVAILABLE");
assert.equal(cm.policy.authentication, "ON_INSTALL");

const am = claudeMarket.plugins.find((x) => x.name === "cpt-floor");
assert.equal(am.source, "./plugins/cpt-floor");
assert.equal(am.version, "0.1.0");

process.stdout.write("cpt-floor plugin bench passed\n");
```

- [ ] **Step 2: Run the bench to verify RED**

Run:

```bash
node tests/cpt-floor-plugin-bench.mjs
```

Expected: non-zero exit with `ENOENT` for `plugins/cpt-floor/.codex-plugin/plugin.json`.

- [ ] **Step 3: Scaffold the Codex package and marketplace entry**

Run the required plugin scaffold, without `--force`:

```bash
python3 /Users/cppeng/.codex/skills/.system/plugin-creator/scripts/create_basic_plugin.py cpt-floor \
  --path /Users/cppeng/.claude/plugins/marketplaces/sharky-3d-assets/plugins \
  --marketplace-path /Users/cppeng/.claude/plugins/marketplaces/sharky-3d-assets/.agents/plugins/marketplace.json \
  --with-skills --with-scripts --with-marketplace \
  --category "Developer Tools"
```

Then set the Codex manifest to this contract:

```json
{
  "name": "cpt-floor",
  "version": "0.1.0",
  "description": "Build, validate, preview, and publish independently authored Central Park Tower floors.",
  "author": { "name": "Shark Studio" },
  "skills": "./skills/",
  "interface": {
    "displayName": "CPT Floor",
    "shortDescription": "Build one Central Park Tower floor.",
    "longDescription": "Create or update a tower floor from the latest developer kit, validate it, open a verified local preview, and publish only after confirmation.",
    "developerName": "Shark Studio",
    "category": "Developer Tools",
    "capabilities": [
      "Download and refresh the floor developer kit",
      "Create and update isolated floor workspaces",
      "Validate and preview floor modules",
      "Claim and publish after explicit approval"
    ],
    "defaultPrompt": "Use $cpt-floor to build a new Central Park Tower floor."
  }
}
```

Add `"version": "0.1.0"` to the new Codex marketplace entry without changing its generated policy fields.

- [ ] **Step 4: Add the Claude Code manifest and marketplace entry**

Create the Claude manifest with no MCP declaration:

```json
{
  "name": "cpt-floor",
  "version": "0.1.0",
  "description": "Build, validate, preview, and publish independently authored Central Park Tower floors.",
  "author": { "name": "Shark Studio" },
  "homepage": "https://github.com/Alterverse-tech/sharky-3d-assets",
  "repository": "https://github.com/Alterverse-tech/sharky-3d-assets",
  "keywords": ["threejs", "tower", "floor-plugin", "game-development"]
}
```

Append this Claude marketplace entry:

```json
{
  "name": "cpt-floor",
  "source": "./plugins/cpt-floor",
  "description": "Build, validate, preview, and publish independently authored Central Park Tower floors.",
  "version": "0.1.0",
  "author": { "name": "Shark Studio" },
  "homepage": "https://github.com/Alterverse-tech/sharky-3d-assets",
  "repository": "https://github.com/Alterverse-tech/sharky-3d-assets",
  "category": "developer-tools",
  "keywords": ["threejs", "tower", "floor-plugin", "game-development"]
}
```

- [ ] **Step 5: Validate GREEN and commit**

Run:

```bash
node tests/cpt-floor-plugin-bench.mjs
python3 /Users/cppeng/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/cpt-floor
git diff --check
```

Expected: both validators pass and the diff has no whitespace errors.

Commit:

```bash
git add .agents/plugins/marketplace.json .claude-plugin/marketplace.json plugins/cpt-floor tests/cpt-floor-plugin-bench.mjs
git commit -m "feat: register cpt-floor plugin"
```

---

### Task 2: Safe developer-kit bootstrap and workspace preservation

**Files:**

- Create: `plugins/cpt-floor/scripts/bootstrap.mjs`
- Create: `tests/cpt-floor-bootstrap-bench.mjs`

**Interfaces:**

- Consumes CLI: `--floor <1-136> --name <text> --key <valid-key> --author <text> [--workspace <absolute-path>] [--hub <url>]`.
- Produces stdout JSON:

```ts
type BootstrapResult = {
  workspace: string;
  floorFile: string;
  absoluteFloorFile: string;
  mode: "created" | "reused";
  ownership: "unclaimed" | "owned";
  commands: {
    validate: ["node", "tools/validate.mjs", string];
    preview: ["node", "tools/dev-server.mjs"];
  };
};
```

Progress and errors go to stderr. A failed run writes no success JSON.

- [ ] **Step 1: Write the failing bootstrap bench**

Create a standalone Node assertion bench that imports these exact exports:

```js
import {
  classifyOccupancy,
  isKitWorkspace,
  isProtectedPath,
  validateArchiveEntries,
} from "../plugins/cpt-floor/scripts/bootstrap.mjs";
```

Cover these cases with `assert`:

```js
assert.doesNotThrow(() => validateArchiveEntries([
  { type: "d", name: "cpt-floor-kit/" },
  { type: "-", name: "cpt-floor-kit/tools/new-floor.mjs" },
]));
assert.throws(() => validateArchiveEntries([{ type: "-", name: "/tmp/escape" }]), /absolute/i);
assert.throws(() => validateArchiveEntries([{ type: "-", name: "cpt-floor-kit/../escape" }]), /traversal/i);
assert.throws(() => validateArchiveEntries([{ type: "l", name: "cpt-floor-kit/link" }]), /link/i);
assert.equal(isProtectedPath("floors/30F-badminton30.js"), true);
assert.equal(isProtectedPath("floors/registry.json"), true);
assert.equal(isProtectedPath(".floor-token"), true);
assert.equal(isProtectedPath("tools/validate.mjs"), false);
```

The integration section must create a temporary fake Hub with `node:http`, serve a generated `cpt-floor-kit.tar.gz`, and verify:

1. first run creates the workspace and canonical floor file;
2. second run reports `reused`;
3. sentinel bytes in the floor file, registry, and token remain unchanged after refresh;
4. kit-owned `tools/validate.mjs` is refreshed;
5. an occupied-floor registry response fails before creating a new workspace;
6. a traversal/link archive fails before creating a new workspace.

Use `mkdtemp`, `execFileSync("tar", ...)`, and an HTTP server bound to `127.0.0.1`; remove only the bench's own temporary directory in `finally`.

- [ ] **Step 2: Run the bench to verify RED**

Run:

```bash
node tests/cpt-floor-bootstrap-bench.mjs
```

Expected: non-zero exit because `bootstrap.mjs` does not exist.

- [ ] **Step 3: Implement argument, workspace, occupancy, and archive contracts**

In `bootstrap.mjs`, export the tested helpers and use this validation shape:

```js
const KEY_RE = /^[a-z][a-z0-9-]{1,23}$/;
const REQUIRED_WORKSPACE_FILES = [
  "tools/new-floor.mjs",
  "tools/validate.mjs",
  "tools/dev-server.mjs",
  "floors/registry.json",
];

export function isProtectedPath(rel) {
  const p = rel.replaceAll("\\", "/").replace(/^\.\//, "");
  return p === ".floor-token" || p === "floors/registry.json" ||
    (p.startsWith("floors/") && p.endsWith(".js"));
}

export function validateArchiveEntries(entries) {
  for (const { type, name } of entries) {
    if (type === "l" || type === "h") throw new Error(`archive link rejected: ${name}`);
    if (name.startsWith("/") || /^[A-Za-z]:[\\/]/.test(name)) throw new Error(`archive absolute path rejected: ${name}`);
    const parts = name.replaceAll("\\", "/").split("/").filter(Boolean);
    if (parts.includes("..")) throw new Error(`archive traversal rejected: ${name}`);
    if (parts[0] !== "cpt-floor-kit") throw new Error(`archive root rejected: ${name}`);
  }
}
```

`classifyOccupancy(registry, floor, key, tokens)` must expand reserved ranges such as `2-7`, reject a published claim with another key, reject the same key without `tokens[key]`, return `owned` for the same key with a token, and otherwise return `unclaimed`.

- [ ] **Step 4: Implement staged setup and protected refresh**

Use only Node built-ins plus `tar`:

```text
parse args → resolve current valid workspace or os.homedir default
→ GET /api/registry and validate JSON shape
→ classify occupancy before filesystem mutation
→ mkdtemp(os.tmpdir()/cpt-floor-)
→ download /kit.tar.gz into the temp directory
→ list verbose archive entries and validate every entry
→ extract under staging
→ validate the staged kit has every REQUIRED_WORKSPACE_FILES entry
→ new workspace: rename staged cpt-floor-kit atomically
→ existing workspace: recursively copy only paths for which isProtectedPath(rel) is false
→ reuse matching canonical module or run tools/new-floor.mjs with execFile
→ verify generated module metadata matches floor/key/name
→ print one BootstrapResult JSON object
→ remove temp directory in finally
```

Read `.floor-token` as JSON only for the requested key; never include its value in stdout, stderr, thrown errors, or the result object. Use `os.homedir()` for the default path and `path.resolve()` for an explicit path. Do not delete or replace an existing final workspace when staging fails.

- [ ] **Step 5: Run GREEN, inspect output, and commit**

Run:

```bash
node tests/cpt-floor-bootstrap-bench.mjs
node plugins/cpt-floor/scripts/bootstrap.mjs --help
git diff --check
```

Expected: the bench passes; help shows every supported flag; no workspace outside the temporary bench directory changes.

Commit:

```bash
git add plugins/cpt-floor/scripts/bootstrap.mjs tests/cpt-floor-bootstrap-bench.mjs
git commit -m "feat: bootstrap isolated floor workspaces"
```

---

### Task 3: Verified preview-server handoff

**Files:**

- Create: `plugins/cpt-floor/scripts/verify-preview.mjs`
- Create: `tests/cpt-floor-preview-bench.mjs`

**Interfaces:**

- Consumes CLI: `--workspace <path> --floor-file <floors/name.js> [--port 3200] [--max-port 3220]`.
- Produces stdout JSON:

```ts
type PreviewResult = {
  port: number;
  pid: number | null;
  reused: boolean;
  url: string;
  moduleUrl: string;
  logFile: string | null;
};
```

- [ ] **Step 1: Write the failing preview bench**

The bench creates a temporary valid workspace with a small fake `tools/dev-server.mjs` that serves `/` and the requested local floor. It must:

1. occupy the requested starting port with a server returning a different module body;
2. run `verify-preview.mjs` with a three-port range;
3. assert it selected another port, returned `reused: false`, and returned a PID;
4. fetch `url` and `moduleUrl`, assert both status codes are 200, and assert the module body equals the local floor bytes;
5. rerun the helper, assert `reused: true` and `pid: null`;
6. terminate only the PID created by the first run and remove only the temporary workspace.

- [ ] **Step 2: Run the bench to verify RED**

Run:

```bash
node tests/cpt-floor-preview-bench.mjs
```

Expected: non-zero exit because `verify-preview.mjs` does not exist.

- [ ] **Step 3: Implement exact-content readiness and safe port selection**

Use this decision contract:

```js
async function probe(port, floorFile, expectedSource) {
  const base = `http://127.0.0.1:${port}`;
  try {
    const [root, floor] = await Promise.all([
      fetch(`${base}/`),
      fetch(`${base}/${floorFile}`),
    ]);
    const source = floor.ok ? await floor.text() : "";
    return root.status === 200 && floor.status === 200 && source === expectedSource;
  } catch {
    return false;
  }
}
```

For each port from `--port` through `--max-port`:

- reuse immediately only when `probe()` matches the exact local source;
- when a TCP connection already exists but `probe()` does not match, leave that process untouched and continue;
- on the first free port, spawn `node tools/dev-server.mjs <port>` with `cwd=workspace`, detached execution, and stdout/stderr appended to `.cpt-dev-server-<port>.log`;
- poll for at most 15 seconds using 100 ms condition-based waits;
- return the preview URL only after `probe()` succeeds;
- if the child exits or readiness times out, report the log path and exit non-zero.

Validate that `floorFile` is a relative path inside `workspace`, exists, and starts with `floors/`. Do not accept `..` or an absolute floor path.

- [ ] **Step 4: Run GREEN and commit**

Run:

```bash
node tests/cpt-floor-preview-bench.mjs
node plugins/cpt-floor/scripts/verify-preview.mjs --help
git diff --check
```

Expected: the bench proves conflict avoidance, exact-source readiness, and reuse.

Commit:

```bash
git add plugins/cpt-floor/scripts/verify-preview.mjs tests/cpt-floor-preview-bench.mjs
git commit -m "feat: verify floor preview readiness"
```

---

### Task 4: Single Skill workflow and authoring reference

**Files:**

- Create: `plugins/cpt-floor/skills/cpt-floor/SKILL.md`
- Create: `plugins/cpt-floor/skills/cpt-floor/agents/openai.yaml`
- Create: `plugins/cpt-floor/references/floor-authoring.md`
- Modify: `tests/cpt-floor-plugin-bench.mjs`

**Interfaces:**

- Consumes: `bootstrap.mjs` BootstrapResult, `verify-preview.mjs` PreviewResult, and the downloaded kit tools.
- Produces: one discoverable `$cpt-floor` workflow shared by Codex and Claude Code.

- [ ] **Step 1: Extend the package bench to verify the Skill contract**

Append assertions that read the Skill, OpenAI metadata, and reference:

```js
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
```

- [ ] **Step 2: Run the bench to verify RED**

Run:

```bash
node tests/cpt-floor-plugin-bench.mjs
```

Expected: non-zero exit because the Skill has not been initialized.

- [ ] **Step 3: Initialize the Skill with generated UI metadata**

Run the required Skill initializer:

```bash
python3 /Users/cppeng/.codex/skills/.system/skill-creator/scripts/init_skill.py cpt-floor \
  --path /Users/cppeng/.claude/plugins/marketplaces/sharky-3d-assets/plugins/cpt-floor/skills \
  --interface 'display_name=CPT Floor' \
  --interface 'short_description=Build and publish a Central Park Tower floor' \
  --interface 'default_prompt=Use $cpt-floor to build a new Central Park Tower floor.'
```

Replace the generated template completely; do not leave its example sections or markers.

- [ ] **Step 4: Write the minimal Skill recipe**

Use this frontmatter:

```yaml
---
name: cpt-floor
description: Use when creating, changing, validating, previewing, publishing, inspecting versions of, or rolling back a Central Park Tower floor plugin, including requests to build a named venue on a numbered tower floor.
---
```

The body must define this exact ordered recipe:

```text
1. Resolve floor, display name, key, and author; ask only when a required value cannot be inferred safely.
2. Resolve <plugin-root> from this loaded SKILL.md path (two directories above the skill folder).
3. Run <plugin-root>/scripts/bootstrap.mjs with argument arrays, never an interpolated shell command.
4. Change working directory to BootstrapResult.workspace.
5. Read AGENTS.md or CLAUDE.md plus FLOOR-AUTHORING.md before editing.
6. Edit only BootstrapResult.floorFile and obey the downloaded ctx API, stage, lift, collision, cleanup, and budget rules.
7. Run BootstrapResult.commands.validate until exit zero; report meaningful warnings.
8. Run <plugin-root>/scripts/verify-preview.mjs and present only its verified URL.
9. Iterate on user feedback locally.
10. Treat “publish/go live” as a new explicit gate: revalidate, inspect only token-key presence, claim if absent, then push.
11. Treat rollback as a separate explicit production mutation.
```

Include a compact command table for bootstrap, validate, preview, claim, push, versions, and rollback. State that commands are executed by the agent and are not setup work for the user. Add common mistakes covering stale local registries, opening a preview before route readiness, overwriting protected workspace state, claiming during setup, exposing tokens, and killing an unrelated port owner.

- [ ] **Step 5: Write the compact reference**

`references/floor-authoring.md` must specify:

- valid workspace markers and the default `~/CPT-Tower-Floors/<floor>-<key>` path;
- `badminton30` as the example key for 30F 羽毛球馆;
- explicit author fallback order: user value, `git config user.name`, OS username;
- remote occupancy classification and claim-race limitation;
- archive and protected-file rules;
- bootstrap and preview JSON fields;
- retry behavior for registry, kit, metadata, validation, preview, claim, and push failures;
- token secrecy and no-publication-without-authorization rules.

Do not copy the `ctx` API table or numeric budgets; tell the agent to read the downloaded `FLOOR-AUTHORING.md` because those values can change with the kit.

- [ ] **Step 6: Validate GREEN and commit the completed Skill**

Run:

```bash
node tests/cpt-floor-plugin-bench.mjs
python3 /Users/cppeng/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/cpt-floor/skills/cpt-floor
python3 /Users/cppeng/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/cpt-floor
wc -l plugins/cpt-floor/skills/cpt-floor/SKILL.md
git diff --check
```

Expected: all validators pass, the Skill is under 500 lines, and no generated markers remain.

Commit:

```bash
git add plugins/cpt-floor/skills plugins/cpt-floor/references tests/cpt-floor-plugin-bench.mjs
git commit -m "feat: add one-command floor authoring skill"
```

---

### Task 5: Public installation and final no-publish verification

**Files:**

- Modify: `README.md`
- Modify: `tests/cpt-floor-plugin-bench.mjs`

**Interfaces:**

- Consumes: public marketplace plugin identity `cpt-floor@sharky-3d-assets`.
- Produces: discoverable install commands for both runtimes and one copyable invocation example.

- [ ] **Step 1: Add failing public-document assertions**

Append:

```js
const readme = readFileSync(path.join(repo, "README.md"), "utf8");
assert.match(readme, /codex plugin add cpt-floor@sharky-3d-assets/);
assert.match(readme, /claude plugin install cpt-floor@sharky-3d-assets/);
assert.match(readme, /\$cpt-floor 给30楼建一个羽毛球馆/);
```

Run `node tests/cpt-floor-plugin-bench.mjs` and expect failure on the first missing README command.

- [ ] **Step 2: Add the public installation and usage copy**

In the existing Installation section, add:

```bash
codex plugin add cpt-floor@sharky-3d-assets
```

to the Codex block and:

```bash
claude plugin install cpt-floor@sharky-3d-assets
```

to the Claude Code block. Add this concise usage example after the manual installation notes:

```text
$cpt-floor 给30楼建一个羽毛球馆
```

Explain in one sentence that the Skill downloads the current author kit, prepares an isolated workspace, validates the floor, and returns a verified hot-reload preview; publishing happens only when the user asks.

- [ ] **Step 3: Run the complete lightweight verification set**

Run:

```bash
node tests/cpt-floor-plugin-bench.mjs
node tests/cpt-floor-bootstrap-bench.mjs
node tests/cpt-floor-preview-bench.mjs
python3 /Users/cppeng/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/cpt-floor/skills/cpt-floor
python3 /Users/cppeng/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/cpt-floor
git diff --check
git status --short
```

Expected: every bench and validator passes; only the planned README/test changes remain uncommitted; no `.floor-token`, floor workspace, cache, or preview log is tracked.

- [ ] **Step 4: Commit the public documentation**

```bash
git add README.md tests/cpt-floor-plugin-bench.mjs docs/superpowers/plans/2026-08-17-cpt-floor-plugin.md
git commit -m "docs: publish cpt-floor installation"
```

---

### Task 6: Publish the marketplace update

**Files:** No new file changes.

**Interfaces:**

- Consumes: clean local `main` containing the approved design, implementation, tests, and installation docs.
- Produces: the same commit at `origin/main`, making `cpt-floor` installable from `Alterverse-tech/sharky-3d-assets`.

- [ ] **Step 1: Verify the exact release state**

Run:

```bash
git status --short --branch
git log --oneline origin/main..HEAD
git remote get-url origin
```

Expected: clean `main`, only the planned CPT Floor commits ahead, and origin `https://github.com/Alterverse-tech/sharky-3d-assets.git`.

- [ ] **Step 2: Push and verify the remote commit**

Run:

```bash
git push origin main
test "$(git rev-parse HEAD)" = "$(git ls-remote origin refs/heads/main | awk '{print $1}')"
```

Expected: push succeeds and the remote `main` SHA equals local `HEAD`. Do not create a tag, GitHub release, or production floor publication.

