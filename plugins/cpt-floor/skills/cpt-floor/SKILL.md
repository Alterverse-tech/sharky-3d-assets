---
name: cpt-floor
description: Use when creating, changing, validating, previewing, publishing, inspecting versions of, or rolling back a Central Park Tower floor plugin, including requests to build a named venue on a numbered tower floor.
---

# Central Park Tower Floor

Take one floor request from a plain-language idea to a validated hot-reload preview. Keep setup mechanical and deterministic; spend judgment on the floor experience itself.

## Required workflow

### 1. Resolve the floor identity

Resolve these required values from the request:

- `floor`: integer 1–136.
- `name`: the user-facing venue name.
- `key`: short English slug followed by the floor when useful, for example `badminton30` for 30F 羽毛球馆. It must match `^[a-z][a-z0-9-]{1,23}$`.
- `author`: explicit user value, otherwise `git config user.name`, otherwise the operating-system username.

Ask one concise question only when a required value cannot be inferred safely. Never silently substitute another floor when the requested floor is occupied.

### 2. Bootstrap the workspace

Resolve `<plugin-root>` from this loaded Skill file: the Skill is at `<plugin-root>/skills/cpt-floor/SKILL.md`. In Claude Code, `${CLAUDE_PLUGIN_ROOT}` is also valid when set; do not assume that variable exists in Codex.

Run the plugin script with separately quoted arguments:

```text
node <plugin-root>/scripts/bootstrap.mjs \
  --floor <floor> --name <name> --key <key> --author <author>
```

Pass `--workspace <absolute-path>` only when the user supplied a path. Pass `--hub <url>` only when the user supplied another CPT Hub. The script otherwise reuses a valid current kit workspace or creates `~/CPT-Tower-Floors/<floor>-<key>`.

Treat a non-zero exit as a setup failure. Do not recreate its download, extraction, occupancy, or refresh logic manually. Read [floor-authoring.md](../../references/floor-authoring.md) for recovery rules.

Parse the single stdout JSON object and change the command working directory to `workspace`.

### 3. Read the current kit contract

Before editing, read the workspace's `AGENTS.md` or `CLAUDE.md` and `FLOOR-AUTHORING.md`. The downloaded documents are authoritative for the current `ctx` API, budgets, stages, collisions, lift access, cleanup, and publishing behavior.

Use the generated `floorFile` as the starting point. Edit only that floor module unless the user separately requests another project change. Do not replace the scaffold with stale examples from this Skill.

### 4. Build the requested floor

Implement the user's venue as a self-contained ES module. Preserve the generated metadata and runtime contract. Keep the lift entrance and spawn usable, create meaningful construction stages, use the kit's shared material/geometry APIs, and stay within the current kit budgets.

Do not use imports, browser globals, direct networking, persistent storage, eval, or unmanaged timers. Do not add a workaround when the kit validator rejects an API or pattern.

### 5. Validate until green

Run the exact `commands.validate` argument array returned by bootstrap, equivalent to:

```text
node tools/validate.mjs <floorFile>
```

Repair every error and rerun until exit code 0. Fix warnings that indicate real collision, lift, cleanup, budget, or usability risk; report any intentionally retained warning.

### 6. Produce a verified preview

Run:

```text
node <plugin-root>/scripts/verify-preview.mjs \
  --workspace <workspace> --floor-file <floorFile>
```

Use the returned `url` only after the script succeeds. It verifies the preview shell and exact local module, avoids killing unrelated port owners, and starts another port when necessary. Never construct or present a speculative `?dev=` URL after a failed readiness check.

Ask the user to inspect the venue and iterate locally on their feedback. Revalidate after changes.

### 7. Keep publishing behind a new explicit gate

Validation and preview are not publication permission. Claim, push, or rollback only after the user gives direct authorization such as “发布” or “上线”. General approval to create or preview a floor is insufficient.

After explicit publish authorization:

1. Rerun validation.
2. Check only whether `.floor-token` contains the requested key; never print, quote, or copy any token value.
3. When the key is absent, run `node tools/publish.mjs claim <floorFile>` once. Stop on any conflict.
4. Run `node tools/publish.mjs push <floorFile>`.
5. Report the returned version and live URL.

`versions <key>` is read-only and may run when requested. `rollback <key> <version>` is a separate production mutation and needs its own explicit instruction.

## Command ownership

| Need | Agent command |
| --- | --- |
| Prepare/update workspace | plugin `scripts/bootstrap.mjs` |
| Validate | workspace `tools/validate.mjs` |
| Start/reuse preview | plugin `scripts/verify-preview.mjs` |
| First publication | workspace `tools/publish.mjs claim`, then `push` |
| Later publication | workspace `tools/publish.mjs push` |
| Inspect history | workspace `tools/publish.mjs versions` |
| Roll back after approval | workspace `tools/publish.mjs rollback` |

Execute these commands for the user. Do not turn kit download, directories, or CLI setup into user homework.

## Common mistakes

- Opening `?dev=` before the exact module route is ready causes `Failed to fetch dynamically imported module`; always use `verify-preview.mjs`.
- A local registry is not proof that a floor is globally free; bootstrap checks the Hub first.
- Refreshing a kit must not overwrite `floors/*.js`, `floors/registry.json`, or `.floor-token`.
- A port being occupied is not permission to terminate its process.
- A successful preview is not permission to claim or publish.
- Token presence may be checked; token contents must never appear in output, source, commits, or chat.
