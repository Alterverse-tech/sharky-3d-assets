# CPT Floor Public Plugin Design

## Goal

Publish one installable `cpt-floor` plugin that lets a tower-floor author use the same `$cpt-floor` skill in Codex or Claude Code. A request such as “给 30 楼建一个羽毛球馆” must take the author from no local kit to a validated, previewable floor without making them manage downloads, paths, or CLI commands.

Publishing is part of the same skill, but it remains a separate, explicit user-authorized step.

## Success criteria

- The plugin is available from the public `Alterverse-tech/sharky-3d-assets` marketplace for both Codex and Claude Code.
- The user invokes one skill name: `$cpt-floor`.
- The skill can create or safely reuse a floor workspace, obtain the current developer kit, scaffold the floor, guide implementation, validate it, and produce a working preview URL.
- A preview URL is not shown until both the preview shell and the exact local floor module return HTTP 200.
- No claim or publish request is sent until the user explicitly asks to publish or go live.
- Existing floor source, registry state, and ownership tokens are never overwritten during a kit refresh.

## Non-goals

- Do not bundle the tower game or a frozen developer kit inside the plugin.
- Do not replace `new-floor.mjs`, `validate.mjs`, `dev-server.mjs`, or `publish.mjs`; the plugin orchestrates the current kit tools.
- Do not add an MCP server, UI, account system, or new publishing API.
- Do not automatically choose a different floor when the requested floor is occupied.
- Do not publish, roll back, or reveal a floor token without a direct user request.

## Public package shape

Add an independent plugin rather than coupling floor authoring to either Asset Center plugin:

```text
plugins/cpt-floor/
├── .codex-plugin/plugin.json
├── .claude-plugin/plugin.json
├── skills/cpt-floor/
│   ├── SKILL.md
│   └── agents/openai.yaml
├── scripts/bootstrap.mjs
└── references/floor-authoring.md
```

Register `./plugins/cpt-floor` in both marketplace manifests:

- `.agents/plugins/marketplace.json`
- `.claude-plugin/marketplace.json`

The plugin has no MCP or external plugin dependency. It depends only on Node.js, standard operating-system archive support, network access to the CPT Hub, and the files delivered by the developer kit.

## Component responsibilities

### `skills/cpt-floor/SKILL.md`

The only user-facing workflow. Its trigger description covers creating, changing, previewing, validating, publishing, version-inspecting, and rolling back a Central Park Tower floor.

Keep the body short and imperative. It must:

1. Extract or confirm floor number, Chinese display name, key, and author.
2. Invoke `bootstrap.mjs` instead of manually recreating download/setup logic.
3. Read the workspace's current `AGENTS.md` or `CLAUDE.md` and `FLOOR-AUTHORING.md` before authoring.
4. Implement the requested floor in the generated module, using the kit API and budget rules.
5. Run the kit validator and repair errors until it exits successfully.
6. Start or reuse a safe preview server and verify the exact floor route before presenting the URL.
7. Iterate on user feedback.
8. Require explicit authorization before claim/push or rollback.

### `scripts/bootstrap.mjs`

A deterministic setup helper for the fragile parts of the workflow. It accepts the resolved floor number, name, key, author, optional workspace path, and optional Hub URL. On success it writes one JSON object to stdout; progress and errors go to stderr. This keeps the result reliable for both agent runtimes while remaining readable in a terminal.

Responsibilities:

- Resolve the workspace.
- Fetch and validate the live registry.
- Download and safely unpack the latest kit.
- Create a new workspace or refresh only kit-owned files in an existing workspace.
- Scaffold the requested floor when it does not already exist.
- Report the workspace, floor file, validation command, preview command, and ownership state.

It does not author the floor contents, start a long-lived preview process, claim a floor, or publish.

### `references/floor-authoring.md`

A compact orchestration reference, not a duplicate of the kit's full API guide. It records:

- workspace detection and protected-file rules;
- key and author derivation;
- preview readiness checks;
- publication authorization and token handling;
- common setup failure recovery.

The actual, current `ctx` API and budget values remain authoritative in the downloaded `FLOOR-AUTHORING.md`.

## User-facing request contract

For `$cpt-floor 给30楼建一个羽毛球馆`:

- `floor`: `30`
- `name`: `羽毛球馆`
- `key`: `badminton30`, unless the user supplies another valid key
- `author`: an explicit user value, otherwise `git config user.name`, otherwise the operating-system username
- default workspace: `~/CPT-Tower-Floors/30-badminton30`

If the current directory is already a valid kit workspace, reuse it. A valid workspace contains `tools/new-floor.mjs`, `tools/validate.mjs`, `tools/dev-server.mjs`, and `floors/registry.json`. Otherwise use the default path unless the user supplied a path.

When a requested name cannot be converted into a confident short English key, ask only for the key; do not block on optional stylistic choices.

## Setup and workspace data flow

1. Resolve the target workspace and canonical floor filename.
2. Fetch `GET <hub>/api/registry` before changing the workspace.
3. Classify the requested floor:
   - unclaimed remotely: creation may continue;
   - claimed under the same key and a matching local token exists: treat as an update;
   - claimed under another key, or claimed without local ownership proof: stop and report the conflict.
4. Download `<hub>/kit.tar.gz` to a newly created temporary directory.
5. Reject an archive containing absolute paths, `..` traversal, links, or content outside the single expected `cpt-floor-kit/` root.
6. Extract to staging first.
7. For a new workspace, move the staged kit into the final location only after all checks pass.
8. For an existing workspace, refresh kit-owned instructions and tools, but never overwrite:
   - `floors/*.js`
   - `floors/registry.json`
   - `.floor-token`
9. If the canonical local floor already exists and its metadata matches the request, reuse it. Otherwise run the downloaded `tools/new-floor.mjs` with the resolved metadata.
10. Return the resolved paths and next actions. Always remove the temporary download directory.

The remote registry check is authoritative for global occupancy. The local registry remains workspace state and must not be replaced by a download.

## Authoring and validation flow

After bootstrap, the agent reads the current kit instructions and uses the generated floor as the starting point. It edits only the target floor module unless the user separately requests another in-scope project change.

The implementation must preserve the runtime contract:

- one self-contained ES module;
- `ctx.level()` called exactly as required by the kit;
- geometry and materials created through the provided `ctx` APIs;
- lift entrance and spawn remain usable;
- construction is divided into meaningful stages;
- prohibited globals, network calls, storage, imports, and unmanaged timers are absent.

Run:

```text
node tools/validate.mjs <floor-file>
```

Treat a non-zero exit as an authoring failure. Repair and rerun until it exits zero. Warnings are reported to the user and fixed when they indicate a real budget, collision, cleanup, or usability risk.

## Preview flow and 404 prevention

Start `node tools/dev-server.mjs` from the resolved workspace. Never kill an unrelated process occupying port 3200.

- If port 3200 already serves the same workspace's target floor with the expected local module, reuse it.
- Otherwise select the next available local port and start a new server there.
- Wait for the preview shell root to return HTTP 200.
- Request the exact `/floors/<filename>` URL and require HTTP 200 plus JavaScript content before presenting the preview link.
- Only then provide `http://localhost:<port>/?dev=floors/<filename>`.

If readiness fails, report the failed route and keep diagnosing; do not give the user a known-broken preview URL. This directly prevents the observed `Failed to fetch dynamically imported module` failure caused by opening the preview before the floor file was actually served.

## Publication flow and authorization boundary

Preview and validation do not imply permission to publish.

Only after the user explicitly says “发布”, “上线”, or an equivalent direct instruction:

1. Rerun validation.
2. Inspect `.floor-token` without printing its contents.
3. If the target key has no token, run `node tools/publish.mjs claim <floor-file>` and stop on any claim conflict.
4. Run `node tools/publish.mjs push <floor-file>`.
5. Report the returned version and live URL.

Never put `.floor-token` in logs, prompts, commits, or generated documentation. Version inspection is read-only and may run on request. Rollback is a production mutation and needs its own explicit instruction.

## Error handling

- **Registry unavailable:** make no occupancy assumption; preserve all local work and provide a retry command.
- **Floor occupied:** stop before scaffolding; show the owning key/name when available and ask the user for another floor.
- **Unsafe or corrupt kit:** reject it before touching the workspace.
- **Partial setup failure:** retain an existing workspace unchanged as far as possible; for a new workspace, do not leave a half-extracted final directory.
- **Existing metadata mismatch:** do not rename or overwrite the source automatically; report the mismatch.
- **Validation failure:** keep the workflow local and unpublished while the agent repairs it.
- **Preview server conflict:** reuse only after positive route verification; otherwise choose another port.
- **Claim race or publish rejection:** preserve the local floor and token file, report the server response, and do not retry with changed identity or metadata.

## Baseline failure and skill-specific correction

The real no-skill baseline opened a nonexistent `floors/30F-badminton.js` route and produced a dynamic-import 404. It also required the agent to rediscover scattered kit, validation, preview, and publication instructions. The new skill corrects the output shape with a fixed contract:

```text
resolved workspace → verified kit → existing/generated module → validation exit 0
→ preview root 200 + exact module 200 → preview URL → explicit publish gate
```

## Lightweight verification

Implementation verification should remain proportional and must not publish a real floor:

1. Validate both plugin manifests and both marketplace entries.
2. Run the skill validator on `skills/cpt-floor` and confirm `agents/openai.yaml` matches the skill.
3. Run `bootstrap.mjs --help` and its archive/path checks against a temporary directory.
4. Perform one no-publish setup smoke test for an unclaimed test fixture or mocked registry/kit endpoint.
5. Confirm a second run reuses the workspace and leaves a sentinel floor file, local registry, and `.floor-token` byte-for-byte unchanged.
6. Confirm occupied-floor and unsafe-archive fixtures fail before workspace mutation.
7. Start the preview server for a fixture floor and verify the root and exact module readiness gates.
8. Forward-test the same representative request with the completed skill, comparing it with the recorded 404 baseline.

No test may call the production claim, publish, or rollback endpoints.

## Delivery

The implementation is complete when the independent plugin and marketplace entries are committed to `Alterverse-tech/sharky-3d-assets`, validation passes, the no-publish smoke flow succeeds, and the repository's main README shows the Codex and Claude Code installation commands plus one `$cpt-floor` example.
