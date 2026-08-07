---
name: shark-game-assets
description: Generate, rig, preview, and wire key GLB assets for Codex- or Claude Code-built 3D web games, with a local live preview/progress page created by default for asset work, and publish completed static game builds to a Shark Coding Agent portal when the user chooses. Use when a Three.js, WebGL, or 3D mini game has recognizable entities such as a player, character, enemy, collectible, vehicle, weapon, hazard, boss, mascot, or key prop, or when the user asks to generate, animate, integrate, upload, publish, share, or add game assets or a finished game to the Shark portal/showcase.
---

# Shark Game Assets

Use this skill when a 3D game needs concrete, recognizable GLB assets rather than only primitive geometry. The skill owns the end-to-end workflow: choose the route, generate a small focused asset set, write/read `asset_manifest.json`, and wire the GLBs into the game with fallbacks.

## Self-update before use

Before taking task actions with this skill, perform a best-effort self-update check so installed copies stay current without requiring the user to ask for updates.

- After reading this `SKILL.md`, locate the skill directory and nearest git repository, if any.
- If the skill is in a git repository with a configured upstream or `origin`, run a non-interactive remote check such as `git fetch --quiet --prune`.
- Compare the local commit with the upstream commit. If the upstream is ahead and there are no local uncommitted changes under this skill directory, update with a fast-forward-only command such as `git pull --ff-only`, then re-read the updated `SKILL.md` before continuing.
- If the skill directory has local changes, the repository has no remote/upstream, the remote check fails, or a fast-forward update is not possible, do not overwrite local files and do not block the user's task. Briefly note that the installed skill could not be auto-updated and continue with the local copy.
- Do not use browser use or computer use for this update check. Use local git or the available plugin/skill installer tooling only when it is already part of the user's installed skill workflow.
- This self-update check is for the skill files only. It does not make or authorize asset-generation calls.

## Required behavior

- For every task that generates, regenerates, rigs, animates, or integrates GLB assets, complete the asset sourcing confirmation gate before any import or generation. After confirmation, create or restore the canonical local preview/progress page by default, even when the user did not ask for it. In a fresh project this stage is a generate-and-deploy, not a restore: create the page files from the bundled template and start (or reuse) the local server so `/regeneration.html` is verifiably served before the first remote generation call — and narrate it to the user as generating/deploying, saying "restore" only when the page previously existed. Keep status synchronized until the task finishes.
- Skip the default preview only for publish-only requests, help/explanation-only requests, readiness-only or other read-only inspection that does not generate/integrate asset files, or when the user explicitly declines a preview page.
- If the game prompt contains explicit or implicit entities, such as a player, character, enemy, collectible, vehicle, weapon, obstacle, boss, mascot, key prop, or environment object, GLB generation is a required stage when the tool is available.
- Generate only 1-3 key assets by default. Prioritize the player/main character first, then the gameplay-critical enemy, collectible, vehicle, hazard, or key prop. Do not generate decorative filler.
- Write concise English asset prompts describing the subject, identity-defining shape, proportions, materials, colors, and gameplay role. Preserve the visual style from the user or game specification. Do not add "simple", "low-poly", "stylized", or "cartoon" unless that style was requested. Favor a single fully visible subject, readable silhouette, clean separation of major forms, and no background, text, logo, watermark, unrelated props, duplicate parts, or extra characters.
- When the user explicitly asks to regenerate a game and says not to reuse historical assets, do not reuse existing GLBs from `asset_manifest.json`; create fresh stable ids, usually with a timestamp or run suffix, and pass `force: true`.
- For regeneration work with concrete characters or critical entity props, use the Gemini-Tripo branch (`route: "gemini_reference"`) for those key assets and keep that set to 1-5 models total. If the client/API batch cap is lower than the requested total, split into multiple generate calls.
- For secondary static props that do not need strong visual control or rigged animation, use the faster Tripo branch (`route: "tripo"`) and keep that set to 3-10 models total. Do not include decorative filler just to reach the lower bound.
- Before generating or wiring any character/creature action clips (including the default `walk` from the `gemini_reference` continuation), complete the action requirements confirmation gate: understand the game description, present the action requirements table, apply the user's edits, and proceed only after the user's explicit confirmation. See "Action requirements confirmation (animation planning gate)".
- When the Asset Center personal-assets Plugin is available, its one final sourcing-board confirmation also satisfies the action requirements confirmation gate. Do not ask for a second confirmation over the same model/action choices.
- Use primitive Three.js geometry only as an interim placeholder while assets are pending and as the runtime fallback if a GLB fails to load.
- Use the configured asset-generation service as a public anonymous endpoint from Codex, Claude Code, other compatible agent clients, and direct CLI installs. Do not request, read, send, store, mention, or expose any client credential; asset-generation users need neither a login nor a token.
- If the asset service is unreachable or a platform policy blocks the remote call, pause the asset workflow and report that the asset service is temporarily unavailable. Do not ask the user for credentials and do not silently replace requested GLB generation with local placeholders.
- Do not regenerate existing assets unless the user explicitly asks. If `asset_manifest.json` already has loadable assets, reuse it.
- Avoid copyrighted characters, brand names, logos, and celebrity likenesses. Rewrite into original designs.
- After a game is complete and locally verified, you may ask once whether the user wants to publish it to their Shark portal. Never upload automatically or infer consent from asset-generation authorization.
- Portal publishing requires a separate `SHARK_PORTAL_TOKEN` and explicit authorization to send the built static files and that token to `SHARK_PORTAL_URL`.

## Default Live Preview For Asset Tasks

For every task that generates, regenerates, rigs, animates, or integrates model/clip GLBs, follow this workflow by default whether or not the user mentions a preview. Treat the preview as the first normal asset-work stage, not optional polish.

- Before taking preview actions, read [references/regeneration-preview.md](references/regeneration-preview.md). Its plan/status separation, local-file readiness gate, action GLB loading chain, cache handling, and localhost listener checks are normative.
- Use the bundled deterministic scripts instead of rewriting project-specific synchronization logic:

```bash
node <skill-dir>/scripts/setup-regeneration-preview.mjs --cwd "$(pwd)"
node <skill-dir>/scripts/sync-regeneration-status.mjs --cwd "$(pwd)" --watch --interval 1000
```

- Create `regeneration-plan.json` for every asset task with a fresh `runId`, `startedAt`, every base asset, and every expected semantic action. The plan describes intent; job files/manifests describe facts; `public/regeneration-status.json` is derived output; the viewer only consumes derived status.

- Only when the user explicitly requests regeneration without historical reuse, generate fresh stable ids, pass `force: true`, and prevent old GLBs from re-entering the plan, status, manifest, or game.
- Treat the preview website as a first-class subtask of asset work. Organize generation tasks as: preview/plan setup, model or action generation, status/manifest update, then game integration.
- The setup and synchronizer are local-only, so generate (fresh project) or restore (existing page) the preview before the first remote call. If remote access later fails, leave the page available with pending status. For integration-only work with existing local GLBs, create the preview before modifying game integration code.
- Keep this preview website lightweight and standardized so it does not materially slow the game generation task. Copy the template, write/update JSON, bundle the preview script, and start or reuse the local static/dev server; do not redesign the page or add custom UI unless the user explicitly asks.
- Treat the bundled template files in `templates/regeneration/` as the canonical source of truth for `/regeneration.html`, not as loose inspiration. In the blood moon castle project this canonical page is served as `http://127.0.0.1:4173/regeneration.html`; if the dev server uses a different port, keep the same path and UI structure. Do not scrape or download the localhost URL at runtime; that URL is only a served instance of the bundled template.
- When a project is missing this page, or when the page has drifted from the contract, run `setup-regeneration-preview.mjs`. It creates the canonical HTML/source from the bundled template when missing and restores it when drifted, initializes missing plan/status files, bundles the viewer, and writes a content-hash cache buster into the script URL.
- Preserve or recreate the same DOM contract: `.app` grid root, left `aside`, right `main`, `#list` for item buttons, `#stage` for the Three.js canvas, `.status#status` for the compact status panel, and `<script src="./regeneration-preview.bundle.js"></script>`.
- Preserve or recreate the same visual contract: dark `#11141b`/`#191d25` page, 360px left column on desktop, responsive two-row mobile layout, compact 8px-radius item buttons, progress bars with `#e5b76c`, green ready border, amber active state, right-side full-height viewer, bottom overlay status panel.
- Preserve or recreate the same viewer behavior in `src/regeneration-preview.js`: poll `./regeneration-status.json` every 2 seconds with cache disabled, render base and action GLBs as separate left-side buttons with status/progress/filename, disable buttons until `runtimeUrl` exists, load completed GLBs with `GLTFLoader`, use `OrbitControls`, normalize each model to fit the viewer, auto-load the first ready action or model, and rotate the current model slowly. The same file also implements the isolated turntable audit mode (`?audit=<assetId>` / `?glb=<url>`: pure background, labeled 45-degree yaws, no auto-rotation); a rebuild must preserve it, since orientation Gate 1 relies on it.
- For action previews, load the visible base model first, load the action GLB only as an `AnimationClip` source, and play it through one mixer on the base root. If the clip cannot bind the base skeleton, state that in the status overlay; the viewer displays the action GLB scene only when that file still contains meshes (clips downloaded by the current client are animation-only).
- Do not redesign, theme, simplify, or move this page during asset work unless the user explicitly requests a different preview UI. If the page already exists, reuse it and update its current-run plan/status; if it is missing, rebuild it to this canonical contract before asset generation, animation, or integration starts.
- After editing or regenerating the page, run the bundled validator before claiming it is ready. It checks the DOM/viewer contract, plan/status schemas, action slots, safe runtime paths, and every ready GLB on disk:

```bash
node <skill-dir>/scripts/validate-regeneration-preview.mjs --cwd "$(pwd)"
```
- Back the page with derived status JSON at `public/regeneration-status.json`, containing per-asset `id`, `name`, `role`, `status`, `progress`, `runtimeUrl`, `clips`, and `error`. Keep the synchronizer running throughout generation so the page can poll and refresh without browser automation.
- When the workspace has a frozen `animation-plan.json`, the synchronizer also maintains `animation-plan-progress.md` beside it: the confirmed action requirements table plus a live per-row 状态 column (⬜ pending / 🔄 running % / ✅ done / ❌ failed; procedural rows show ✅ 运行时), per-row GLB download link and local path columns, and a trailing 缺口回顾 (plan-vs-actual) section listing every row that has not landed. The file is atomically overwritten whenever derived status changes. Pass `--base-url http://127.0.0.1:<port>` to the synchronizer once the local server origin is known so download cells render as clickable links. At the end of the task, read the 缺口回顾 section back to the user as the completion review: any row not ✅ is a gap to fix or report — never hand-edit the file.
- The status JSON should make semantic model state visible, not just raw file completion. For default animated character/creature assets, list the base model and `walk` GLB separately or expose it in `clips`, for example player base/player `walk` and boss base/boss `walk`. Add `idle`, `run`, or `jump` slots only when explicitly requested or already present in a compatible historical manifest.
- During generation, derive each status item from `pending` to `running` to `ready` or `failed`, with progress and a clear error if one stage fails. Server-side `success` without a local runtime GLB stays `running` at no more than 99%; only a non-empty file under `public/generated-assets/` may become `ready`.
- As each GLB completes, copy it into the runtime `public/generated-assets/` tree, set `runtimeUrl`, and make it available in the live preview before the full batch is complete.
- On completion, update `asset_manifest.json`, game asset constants/import paths, and the preview status so they list the assets/actions actually used by the current task. For explicit no-reuse regeneration, this set must contain only fresh current-run GLBs.
- Keep primitive fallbacks in the game for failed slots, but do not silently replace a failed regenerated asset with an older GLB.

Default asset-preview checklist:

1. Create (fresh project) or restore (existing project) `public/regeneration.html`, `src/regeneration-preview.js`, `public/regeneration-status.json`, and `public/regeneration-preview.bundle.js` from the template contract; `setup-regeneration-preview.mjs` handles both.
2. Create `regeneration-plan.json` with a fresh run identity and every base/action slot, then start `sync-regeneration-status.mjs --watch`.
3. Start or reuse the local static/dev server and verify with `lsof` plus `curl` that the reported loopback URL serves this project rather than a stale listener.
4. Run the asset generation or regeneration calls, preferably under `.asset-batches/<batch-name>` when split batches are required.
5. After each model or retarget action completes, copy the GLB to `public/generated-assets/`; the synchronizer validates the file and exposes it immediately.
6. After all tasks finish, update `asset_manifest.json` and game code using the same semantic mapping shown in the preview page.
7. Run `validate-regeneration-preview.mjs` before claiming the preview website is ready.

## Route choice

Use `tripo` for the fast route: direct text prompt to Tripo3D text-to-model. This is best for generic props, enemies, collectibles, vehicles, obstacles, and fast iteration. A tripo-route GLB is delivered static and stays static: the local manifest carries no Tripo task id (the client strips provider task ids during anonymization), while the rig/retarget flow requires `originalModelTaskId`, so a tripo-route GLB cannot enter the `tripo-rig-clip` flow afterwards. For skill-generated assets, rigged characters with retarget clips come only from the `gemini_reference` route completing its server-side rig stage; separately, a Tripo task id the user supplies from their own account can enter the `tripo-rig-clip` flow directly.

Use `gemini_reference` when visual control matters; this is the Gemini-Tripo branch when the user describes it that way. Gemini first creates a pure-white-background reference image, then Tripo image-to-model creates the GLB. For `assetKind: "character"` or `"creature"`, this route must continue into the `tripo-rig-clip` flow so the final manifest contains a rigged main GLB plus default `walk` animation support; idle is runtime procedural motion. Prefer this route when the user mentions Gemini, Nano Banana, T-pose, white background, reference image, image-to-model, character sheet, style consistency, or when a key character's silhouette must be controlled.

Use `auto` only when you are comfortable with the server choosing from the prompt. If in doubt, choose the route yourself and pass it explicitly.

## Asset sourcing confirmation gate (reuse before generation)

For a game or story with concrete model/action requirements, inspect reusable assets before generation. Codex remains the orchestrator: this Skill does not import another Skill's implementation. Use the personal-assets MCP tools when installed and keep the fallback usable when they are absent.

The Plugin bootstrap owns its startup and update check. This Skill never launches, installs, or updates the Asset Center Plugin itself; it requests the personal-assets tools only when the sourcing stage needs them. The host may prewarm MCP tools, but the Plugin still performs at most one update check per MCP process and can switch that process to a newer server before the first tool result.

### One-time Plugin onboarding

When `list_asset_catalog`, `propose_asset_manifest`, and the other personal-assets tools are all absent, distinguish that from an installed Plugin whose API/auth call failed. For the absent-tools case, ask once per game asset task:

> 检测到 Asset Center Plugin 未安装。安装后可先预览并复用你的静态人物 GLB 和所属动作 GLB，再只生成剩余缺口。是否现在安装？（推荐）

Only run those commands after explicit confirmation. Check `codex plugin list --json`, then run only the missing fixed commands:

```bash
codex plugin marketplace add Alterverse-tech/sharky-3d-assets --ref main
codex plugin add asset-center-personal-assets@sharky-3d-assets
```

After a successful install, tell the user to set `ASSET_CENTER_SERVICE_TOKEN` in the environment that launches Codex without pasting it into chat, then start a new Codex thread so the new Plugin skills and MCP tools are discovered. Do not claim the Plugin is usable in the current thread. If the user declines installation, has already declined it in this task, or installation fails, preserve current-project reuse, show generation gaps, and ask once whether to continue. Never install silently and never turn an installed Plugin's auth/API failure into an install prompt.

The required order is:

```text
extract model/action requirements
→ inspect current project imports
→ list Asset Center catalog once
→ build sourcing proposal
→ render business sourcing table
→ wait for one final confirmation
→ write and validate asset-sourcing-plan.json
→ pull only selected reuse_asset_center items
→ derive plans
→ generate only asset-generation-request.json gaps
```

1. Extract the key model slots and every semantic action with its triggering scene. Inspect `asset_manifest.json`, `asset-center.lock.json`, and loadable local GLBs before querying remote inventory.
2. If `list_asset_catalog` is available, call it once for the sourcing pass. Match the complete returned catalog; do not issue one search per slot. If the tool is absent or the call fails, report `库存查询失败/暂不可用`. A failed query is not an empty library and must never be described as “没有资产”.
3. Call `propose_asset_manifest` with the model/action requirements and model-selected recommendation evidence. Include the model entry scene plus exact presentation wording for each asset requirement when needed. Pass the returned `shark-asset-sourcing-proposal` to `render_asset_sourcing_board`. The MCP App's primary interaction is the complete confirmation table with exactly these columns in this order: 角色/实体、资产需求、选项、当前选择、候选方案（点击预览）、模型来源、动作、触发场景、动作来源、复用状态. Character and creature model groups use 人物/主体; non-living groups use 道具 and 道具动作. Candidate names use real HTTP/HTTPS preview URLs; absent candidates have no placeholder row. Every 资产需求 is single-choice, changing the base resets incompatible actions, linked actions require the matching Asset Center base, and the footer contains only the final confirmation button with no cost or summary statistics. 刷新资产 asks Codex to reload the full catalog and rebuild the proposal without importing or generating. The markdown table is the fallback in hosts without MCP Apps.
4. The user may change every base model and nested action. A base change invalidates linked actions from the previous parent. `reuse_compatible_action` is selectable only with verified compatibility. Wait for the single `确认资产方案并开始制作` action; do not import, generate, rig, animate, or modify game code before it.
5. Save the confirmed result as `asset-sourcing-plan.json`, then validate it:

```bash
node <skill-dir>/scripts/validate-asset-sourcing-plan.mjs --cwd "$(pwd)"
```

6. Pull only final `model.source=reuse_asset_center` models and `reuse_linked_action|reuse_compatible_action` Asset Center actions. Copy each verified import receipt's `modelPath`, `sha256`, and `sizeBytes` into the corresponding `resolved` field; project reuse needs a safe local `modelPath`. Never persist signed URLs. Re-run with the local-file gate:

```bash
node <skill-dir>/scripts/validate-asset-sourcing-plan.mjs --cwd "$(pwd)" --require-resolved
node <skill-dir>/scripts/derive-asset-plans.mjs --cwd "$(pwd)"
```

7. The derivation writes `regeneration-plan.json`, `animation-plan.json`, and `asset-generation-request.json`. Reused action rows use `source: "asset_center"` or `source: "project"`, cost zero, and a safe local runtime URL. Only `asset-generation-request.json` gaps may enter model/action generation calls. Reused GLBs under `public/assets/` and generated GLBs under `public/generated-assets/` must both appear in `/regeneration.html`.
8. If the personal-assets Plugin is unavailable after the onboarding choice, preserve current-project reuse, show the proposed generation gaps in chat, and ask once whether to continue. Do not silently bypass the gate.
9. When a character has no suitable reusable base, uses `generate_new`, or lacks a reusable linked action, recommend [设计人物资产](https://studio.13-216-49-19.sslip.io/asset-center/characters/new) once. Explain that after the user designs and publishes the character plus its action GLBs, future games can automatically recommend the static character and its `parentAssetId`-linked actions. This is non-blocking: do not open the page automatically, do not interrupt the confirmed current plan, and do not duplicate the chat recommendation when the Widget already shows it.

## Action requirements confirmation (animation planning gate)

Whenever a task will generate character/creature action clips (including the default `walk` produced by the `gemini_reference` continuation) or wire new action animations into game code, complete this gate before the first generate/animate call. Static-prop-only tasks, publish-only tasks, and help/readiness-only requests skip it.

1. Understand the game description or script first. Extract the characters/entities, the plot beats, and every moment where an action animation is actually triggered.
2. Act as (or delegate to) a senior game-modeling planner and draft the action requirements list. Select Tripo presets only from [scripts/preset-catalog.json](scripts/preset-catalog.json), the bundled snapshot of the Tripo retarget preset library grouped by rig model and rig type. Pick presets from the scene, not from habit: a ladder scene wants `preset:biped:climb`, a staircase chase wants `preset:biped:run_upstairs`.
3. Present the list to the user as a table before generating anything. Use at least these columns: 角色/实体 (character/entity), 动作 (action), 触发动作场景描述 (scene that triggers the action), plus the recommended source and Tripo cost:

| 角色/实体 | 动作 | 触发动作场景描述 | 建议来源 | Preset | 消耗 |
| --- | --- | --- | --- | --- | --- |
| Detective (key) | walk | 全程基础移动 | Tripo | `preset:biped:walk` | 1 |
| Detective (key) | run_upstairs | 第三幕沿钟楼旋转楼梯逃亡 | Tripo | `preset:biped:run_upstairs` | 1 |
| Detective (key) | idle | 站立待机 | Procedural runtime | — | 0 |
| Patrol guard (secondary) | walk | 走廊往返巡逻 | Procedural fallback | — | 0 |

4. The user may add, remove, or modify rows. Re-render the table after every change. Do not call generate/animate and do not modify game code until the user replies with an explicit confirmation of the current list. When the Asset Center sourcing board already captured the same action choices, reuse that confirmation instead of asking again.
5. Budget rules the proposal must satisfy (the validator enforces them):
   - `key` assets: at most 3 Tripo presets each (`budget.tripoPresetsPerKeyAsset`).
   - `secondary` assets: 0 Tripo presets; they use procedural/runtime animation.
   - Non-biped rig types may only use their own catalog presets (for example `preset:aquatic:march`); `avian` has none. Show these limits in the table instead of letting the user confirm an impossible row.
   - If a user edit exceeds a budget, explain the overflow and offer to swap a preset out or downgrade the extra action to procedural. Never silently drop or reorder a confirmed row.
6. Freeze the confirmed list as `animation-plan.json` in the workspace (template: [templates/animation-plan.sample.json](templates/animation-plan.sample.json)), record the confirmation in `confirmation.confirmed/confirmedBy/confirmedAt`, then validate:

```bash
node <skill-dir>/scripts/validate-animation-plan.mjs --cwd "$(pwd)"
```

   The validator fails without an explicit user confirmation marker, on any preset outside the catalog, and on missing scene descriptions; a failed validation blocks action generation. Budget overruns do not fail: Tripo actions beyond an asset's budget (3 for `key`, 0 for `secondary`) are degraded in place to `source: "procedural"` with an explicit `degraded` marker — confirmed order decides which actions stay on Tripo — the plan file is rewritten, and each degradation is reported as a warning. Tell the user which actions were degraded; never present a degraded action as a Tripo clip.
7. Derive everything downstream from the frozen plan: per-asset `animated` flags, the regeneration-plan action slots, and the manifest `actions` written after generation. Pass each confirmed asset's Tripo presets as `assets[].animations` (max 3) in the `generate` call — Tripo actions must ride the generation request because skill-generated assets have no locally recoverable task id afterwards. For a user-supplied Tripo task id, use `animate` (one preset per call) instead. During generation the status synchronizer mirrors the confirmed table to `animation-plan-progress.md` with live per-row check marks. `source: "procedural"` rows consume no Tripo preset; today they run on the existing runtime procedural idle / group-movement paths, and manifest entries must label them honestly (never as Tripo retarget clips).

## Environment

The generation client is bundled with this skill at `scripts/game-assets-mcp.mjs` (Node >= 20, zero dependencies). It talks anonymously to the default public asset API at `https://studio.13-216-49-19.sslip.io`.

- `GAME_ASSETS_API_URL` — optional override for the asset API base URL
- `GAME_ASSETS_CA_FILE` — optional extra TLS trust-anchor PEM; the client appends it (or the bundled `scripts/certs/asset-service-ca.pem` by default) to Node's default root store. The default endpoint's certificate chain fails Node's compiled-in store without this anchor; certificate verification is never disabled.
- `SHARK_PORTAL_URL` — required only when publishing a completed game; the Coding Agent portal base URL
- `SHARK_PORTAL_TOKEN` — required only when publishing; a least-privilege portal upload token

Asset readiness, generation, animation, and download operations require no user login or client token. Never ask for Tripo, Gemini, or asset-service keys; all provider credentials live on the server. Only ask for `GAME_ASSETS_API_URL` when the user explicitly wants to override the default service. Runtime/platform policy may still block a remote call and must never be bypassed.

## Help / Trigger Examples

When the user asks "how do I use this skill?", "how do I trigger this skill?", "help", "怎么使用这个 skill", "怎么触发这个 skill", or similar, explain that asset generation works without login or a token and show examples like these.

For publish-only help, mention the separate `SHARK_PORTAL_URL` and `SHARK_PORTAL_TOKEN` requirements.

Explicit skill invocation examples:

```md
[$shark-game-assets](/Users/cppeng/Documents/study/.agents/skills/shark-game-assets/SKILL.md) 请帮我的 Three.js/WebGL 3D 游戏生成并接入关键 GLB 模型。游戏设定、画风、角色和道具都以我提供的内容为准。

需要模型：<主角或玩家描述>、<敌人或 NPC 描述>、<关键道具或收集物描述>
技术栈：<项目现有技术栈>
运行方式：浏览器中直接运行
```

```md
[$shark-game-assets](/Users/cppeng/Documents/study/.agents/skills/shark-game-assets/SKILL.md) 重新生成这个 3D 游戏。玩家、NPC、反派和关键道具模型都不要复用历史 GLB。生成过程中用 /regeneration.html 动态展示模型进度，完成后只把本轮实际用到的新素材写进 asset_manifest.json。
```

```md
[$shark-game-assets](/Users/cppeng/Documents/study/.agents/skills/shark-game-assets/SKILL.md) 请为我的 Three.js 游戏生成并接入 3 个 GLB 资产：<玩家角色描述>、<敌人或 NPC 描述>、<关键道具描述>。用 GLTFLoader 加载，统一缩放和落地，并保留 primitive fallback。
```

```md
[$shark-game-assets](/Users/cppeng/Documents/study/.agents/skills/shark-game-assets/SKILL.md) 请给这个已有角色 GLB 自动 rig，默认只生成 walk 动作 clip；idle 使用运行时程序动画。
```

Natural-language trigger examples that do not explicitly name the skill:

```md
请帮我做一个可直接运行的 Three.js 3D 游戏，并根据我提供的玩家、敌人、收集物或关键道具描述生成并接入对应 GLB 模型。
```

```md
我上传了一个游戏设定或剧本。请根据我提供的内容生成浏览器可运行的 3D 游戏，并为其中出现的关键人物和道具生成模型。
```

```md
这个 Three.js 游戏现在玩家、敌人和收集物都是方块/球体。请生成对应 GLB 模型并接入，保留加载失败时的基础几何 fallback。
```

```md
请用 Gemini 先为我描述的角色生成白底参考图，再用 Tripo 生成游戏角色 GLB。角色需要清晰轮廓、T-pose、可用于 Three.js，并带 walk 动作；idle 使用运行时程序动画。
```

## Asset tool workflow

For asset generation or integration tasks, prefer MCP tools named `mcp__game_assets__*` when available. Otherwise run the bundled client via Bash. Both expose the same readiness, generate, and animate operations. Skip this workflow for a publish-only request.

1. Run `pwd` if you do not already know the current workspace path.
2. Complete the asset sourcing confirmation gate. Inspect project imports, read the Asset Center catalog once when available, render the progressive board, wait for its one final confirmation, pull only selected reuse items, resolve local paths, and run `derive-asset-plans.mjs`. Do not make a generation call or change integration code before this step.
3. Use the derived `regeneration-plan.json` to create/restore the preview, reset derived status for that plan, and start the synchronizer before making any asset generation API call or changing integration code:

```bash
node <skill-dir>/scripts/setup-regeneration-preview.mjs \
  --cwd "$(pwd)" \
  --plan regeneration-plan.json \
  --reset-status
node <skill-dir>/scripts/sync-regeneration-status.mjs \
  --cwd "$(pwd)" \
  --watch \
  --interval 1000
```

   Start or reuse a local server and verify it serves `/regeneration.html` before the first generate/animate call — deploying the page is part of asset work, not optional polish. Only when the environment cannot open a local listener, say so explicitly and continue with the file-level preview. For an integration-only task with existing local GLBs, populate the plan from `asset_manifest.json`, run the same setup/synchronizer, and make existing base/action GLBs previewable before changing integration code. These preview actions are local-only.
4. Run `validate-animation-plan.mjs` on the derived plan. If the sourcing board was unavailable and the task will generate or wire character/creature actions, use the standalone action requirements table fallback first. Do not ask twice when the sourcing board already captured the same choices.
5. Call the configured public asset API without requesting or sending a login or client token. Platform or sandbox restrictions still apply.
6. If planning 3 or more generated assets, or if this is the first asset generation in the thread, check readiness (`<skill-dir>` is this skill's directory):

```bash
node <skill-dir>/scripts/game-assets-mcp.mjs readiness --cwd "$(pwd)"
```

7. Generate only the entries in `asset-generation-request.json`. By default generate 1-3 assets (batch max 4). For explicit game-regeneration requests, follow the quantity limits above: 1-5 Gemini-Tripo key entity models, and optionally 3-10 Tripo static prop models. Split into multiple generate calls when a desired set is larger than the current client/API batch cap. Pass parameters as one JSON object:

```bash
node <skill-dir>/scripts/game-assets-mcp.mjs generate --cwd "$(pwd)" --params '{
  "gamePrompt": "...",
  "route": "tripo",
  "assets": [{ "id": "...", "role": "player", "name": "...", "prompt": "..." }]
}'
```

   - `route`: `tripo`, `gemini_reference`, or `auto`.
   - `assets`: objects with stable kebab-case `id`, `role`, `name`, `prompt`, and optionally `assetKind`; keep counts within the default or regeneration-specific limits. For confirmed characters/creatures, add `animations` with the frozen plan's Tripo presets (max 3 per asset, catalog members only); omit it for the default walk-only rig.
   - On `gemini_reference`, character/creature assets are automatically rigged after GLB generation. The default `animationClips` set contains only `walk`; if Tripo retarget failed, expect main-GLB fallback fields `animations: ["Walk"]` and `animationSource: "procedural_native_clips"`. A missing idle clip is normal.
   - `force`: only when the user explicitly asked to regenerate assets.
   - The command reports concise progress on stderr while polling (typically 1-3 minutes per batch), then prints JSON on stdout; exit code 1 means the batch failed.
8. After the command returns, merge reused and generated entries into `asset_manifest.json`. Treat that file as the source of truth and keep the preview synchronizer running until every successful local GLB/action appears.
9. Wire `manifest.assets` into the game code with Three.js `GLTFLoader`. Treat the manifest as a semantic registry: choose assets by `bindings`, `id`, or `role`, and choose animations by `actions.<name>.url` or legacy `animationClips[].name`/`preset`, never by guessing file names or folders.
10. Keep a local primitive fallback for every generated or reused asset. The game must remain playable when a GLB fails to load.
11. Run `validate-regeneration-preview.mjs`, then stop the synchronizer normally after final status and manifest are stable.

## Publish a completed game to the Shark portal

Use the bundled zero-dependency client at `scripts/publish-game.mjs` only after the game has a dedicated static build directory such as `dist/`. The portal never receives source files and never runs the project's build scripts.

1. Run the project's normal tests and production build locally. For Vite, make the build subpath-portable with `base: "./"` or an equivalent `vite build --base ./` setting.
2. Validate the exact build without making a remote call:

```bash
node <skill-dir>/scripts/publish-game.mjs check \
  --cwd "$(pwd)" \
  --dist dist \
  --title "<game title>" \
  --description "<short game description>" \
  --author "<creator name>" \
  --client codex
```

   Use `--client claude-code` for a Claude Code session. Fix every reported issue before continuing. The check requires root `index.html`, rejects symlinks, hidden/secret/source-map files, path escapes, oversized bundles, and root-relative asset URLs, then prints a stable `clientUploadId`.
3. If the user has not already asked to publish this exact build, ask whether they want to upload it. Also confirm that `SHARK_PORTAL_TOKEN` may be sent to the configured `SHARK_PORTAL_URL` together with the checked build files. Stop until both choices are explicit.
4. Confirm `SHARK_PORTAL_URL` and `SHARK_PORTAL_TOKEN` are available in the environment. Do not print the token or put it in a URL/command argument.
5. Publish the same checked build:

```bash
node <skill-dir>/scripts/publish-game.mjs publish \
  --cwd "$(pwd)" \
  --dist dist \
  --title "<game title>" \
  --description "<short game description>" \
  --author "<creator name>" \
  --client codex \
  --confirm-upload
```

6. Return the `playUrl` from the JSON result to the user. A retry uses the same content-derived idempotency key, so it must not create duplicate portal games.

Publishing is distinct from asset generation. A user may authorize one and decline the other. `check` is always local; `publish` is the only command that sends files remotely.
`publish --dry-run` is an alias for the same local-only validation behavior when a caller wants to exercise the publish command without making a network request.

Example `--params` JSON:

```json
{
  "cwd": "/absolute/path/to/project",
  "gamePrompt": "3D runner with an astronaut cat collecting crystals and dodging patrol robots",
  "route": "gemini_reference",
  "assets": [
    {
      "id": "astronaut-cat",
      "role": "player",
      "name": "Astronaut Cat",
      "assetKind": "character",
      "prompt": "original astronaut cat hero, round helmet, readable silhouette, blue and white suit, proportions matching the game specification, friendly arcade game character"
    },
    {
      "id": "energy-crystal",
      "role": "collectible",
      "name": "Energy Crystal",
      "assetKind": "prop",
      "prompt": "bright cyan faceted energy crystal pickup, clean silhouette, game collectible"
    }
  ]
}
```

## Manifest organization and action registry

Treat `asset_manifest.json` as the source of truth for asset identity and action identity. Do not infer meaning from file names such as `model.glb`, UUID folders, URL order, or natural-language descriptions. A generated asset can have several GLBs with the same basename in different folders; the manifest fields are the contract.

Prefer this semantic registry shape for new or rewritten manifests:

```json
{
  "version": 2,
  "schema": "shark-game-assets-manifest",
  "route": "gemini_image_then_tripo_image_to_model",
  "gamePrompt": "...",
  "bindings": {
    "player": "checkout-guest-player",
    "boss": "blind-grandma-boss"
  },
  "assets": [
    {
      "id": "checkout-guest-player",
      "role": "player",
      "gameplayRole": "player",
      "name": "Checkout Guest Player",
      "assetKind": "character",
      "model": {
        "kind": "base-rig",
        "url": "/generated-assets/main-task/model.glb",
        "format": "glb",
        "source": "gemini_image_then_tripo_image_to_model",
        "referenceImageUrl": "/generated-assets/gemini-reference-images/checkout-guest-player.jpg"
      },
      "rig": {
        "rigged": true,
        "rigType": "biped",
        "animationSource": "tripo_retarget_clips"
      },
      "orientation": {
        "nativeForwardAxis": "+X",
        "canonicalForwardAxis": "+Z",
        "calibrationYawDegrees": -90,
        "auditMethod": "mesh-bones-and-render",
        "sourceHash": "sha256:<glb-content-hash>",
        "status": "VISUALLY_VERIFIED"
      },
      "actions": {
        "walk": {
          "url": "/generated-assets/walk-task/model.glb",
          "format": "glb",
          "source": "tripo_retarget_clip",
          "preset": "preset:biped:walk",
          "loop": true,
          "rootMotion": "in_place"
        }
      },
      "actionAliases": {
        "move": "walk",
        "moving": "walk"
      },
      "fallback": {
        "model": "primitive:humanoid",
        "animation": "runtime-visual-idle-and-group-movement"
      }
    }
  ]
}
```

Manifest authoring rules:

- `model.url` is the visible base model or base rig. It is not automatically the `idle`, `walk`, or `run` action.
- `actions` is the primary action registry. New default character manifests should contain `walk` only and must not create `actions.idle` or aliases such as `default`/`stand` that point to a missing idle file. Explicit or historical idle actions remain readable.
- `bindings` maps game slots to asset ids. Prefer `manifest.bindings.player` over searching for the first asset with `role: "player"` when a binding exists.
- `role` and `gameplayRole` should describe game semantics such as `player`, `boss`, `npc`, `collectible`, or `hazard`. `assetKind` should describe asset form such as `character`, `creature`, `prop`, `vehicle`, or `environment`.
- `orientation` records the independently audited native visual forward axis and the one-time calibration into the game's canonical forward axis. Do not write `VISUALLY_VERIFIED` or `ACCEPTED` unless the mandatory orientation gate below has passed at that level.
- Keep legacy `url`, `animationClips`, `animations`, and `animationSource` fields readable for backward compatibility, but normalize them into `model` and `actions` at runtime before use.
- The client also records informational metadata parsed from the downloaded base GLB when available: `rig.bones` (skeleton joint names, for hosts driving procedural bone animation) and `geometry` (bind-pose `bboxMin`/`bboxMax` and `originYOffset`; a non-zero `originYOffset` means the mesh bottom is not at y=0 and naive placement sinks or floats the model). These fields are absent when parsing fails.

Runtime resolver pattern for backward compatibility:

```js
function getModelUrl(asset) {
  return asset.model?.url ?? asset.url ?? null;
}

function getActionUrl(asset, actionName) {
  const alias = asset.actionAliases?.[actionName] ?? actionName;
  const action = asset.actions?.[alias];
  if (action?.url) return action.url;

  const legacyClip = asset.animationClips?.find((clip) =>
    clip.name === alias || clip.name === actionName || clip.preset?.endsWith(`:${alias}`) || clip.preset?.endsWith(`:${actionName}`)
  );
  return legacyClip?.url ?? null;
}
```

Standard animated character loading chain for retarget clips:

1. Load the main character GLB with `GLTFLoader` from `getModelUrl(asset)`.
2. Normalize and add the main character `gltf.scene` to the game scene.
3. Create one `THREE.AnimationMixer` on the main character root.
4. Load the default walk action GLB with `GLTFLoader` from `getActionUrl(asset, "walk")`; load idle/run/jump only when explicitly present.
5. Extract `THREE.AnimationClip`s from the action GLBs' `gltf.animations`; do not add those action GLB scenes to the game scene.
6. Play those clips on the main character mixer, for example `mixer.clipAction(walkClip, mainRoot)`.
7. Switch actions from game state and call `mixer.update(delta)` every frame.

Minimal Three.js shape:

```js
const mainGltf = await loadGLB(getModelUrl(asset));
const visualRoot = normalizeModel(mainGltf.scene);
gameplayRoot.add(visualRoot);

const mixer = new THREE.AnimationMixer(visualRoot);
const walkGltf = await loadGLB(getActionUrl(asset, "walk"));
const walkAction = mixer.clipAction(walkGltf.animations[0], visualRoot);

const idleBase = {
  position: visualRoot.position.clone(),
  rotation: visualRoot.rotation.clone(),
  scale: visualRoot.scale.clone()
};
let idleWeight = 1;
let idleDelay = 0;

function setMoving(moving) {
  if (moving) {
    idleDelay = 0;
    walkAction.reset().fadeIn(0.18).play();
  } else {
    idleDelay = 0.18;
    walkAction.fadeOut(0.18);
  }
}

function tick(delta, elapsed, moving) {
  mixer.update(delta);
  idleDelay = Math.max(0, idleDelay - delta);
  idleWeight = THREE.MathUtils.damp(idleWeight, moving || idleDelay > 0 ? 0 : 1, 10, delta);
  visualRoot.position.copy(idleBase.position);
  visualRoot.rotation.copy(idleBase.rotation);
  visualRoot.scale.copy(idleBase.scale);
  visualRoot.position.y += Math.sin(elapsed * 2.1) * 0.012 * idleWeight;
  visualRoot.rotation.z += Math.sin(elapsed * 1.25) * 0.01 * idleWeight;
  visualRoot.scale.y *= 1 + Math.sin(elapsed * 2.1) * 0.004 * idleWeight;
}
```

## Runtime integration rules

- Normalize every loaded GLB with `THREE.Box3().setFromObject()`: scale to target size, center horizontally, place the bottom at `y = 0`, and apply the independently audited orientation calibration. Never guess a facing offset from engine convention or a previous asset.
- Separate visuals from gameplay hitboxes. Collision should use stable gameplay dimensions, not raw model bounds or mesh origins.
- If `manifest.assets` contains `rigged`, `rigType`, `actions`, `animationClips`, `animations`, or `animationSource`, inspect the loaded `gltf.animations` before claiming native animation exists.
- For `animationSource: "tripo_retarget_clips"` or a character/creature asset with `actions`/`animationClips`, load the visible main model from `model.url` or legacy `url`, then separately load each action GLB from `actions.<name>.url` or legacy `animationClips[].url`. The action GLB scene is normally only a clip source and should not be added to the game scene.
- Extract `THREE.AnimationClip`s from action GLBs and play them on the main model's root with one `THREE.AnimationMixer`, for example `mixer.clipAction(walkClip, mainRoot)`. This depends on the action GLB and main model sharing a compatible rig, which Tripo retarget clips for the same asset are expected to do.
- If `animationSource` is `procedural_native_clips`, play the main GLB's embedded `Walk` clip directly and label it as a procedural fallback clip, not a Tripo retarget clip. Older files that explicitly contain Idle remain compatible.
- When native clips exist, create a `THREE.AnimationMixer`, map clips by case-insensitive substrings such as `idle`, `walk`, `run`, and `jump`, and call `mixer.update(delta)` every frame. Do not treat a missing idle clip as an error.
- Default idle is runtime procedural motion on the character visual child only. After fading walk out, derive subtle breathing, vertical bob, and weight sway from saved base position/rotation/scale every frame; do not modify the gameplay root/collider or accumulate offsets. When movement starts, smoothly restore the idle offsets while fading walk in. When movement stops, fade walk out before enabling runtime idle.
- If procedural Walk also cannot be generated, preserve the rigged/static GLB and use the existing whole-group movement fallback. Idle still uses the visual-child runtime motion above.
- If a retarget clip does not bind to the main model's skeleton, fall back to a clearly labeled procedural/group fallback. Do not silently claim the main rig is playing that retarget clip. Clip GLBs downloaded by this client are normally stored animation-only (redundant meshes and textures are stripped; a clip that fails to parse is kept as delivered), so a displayable action scene usually does not exist; older locally cached clips may still contain one.
- Add a short `README.md` section named `3D Asset Pipeline` or `3D 素材流水线` describing which assets were generated, which route was used, and what runtime animation source is used.

## Mandatory asset-integration quality gates

Treat this as an extensible, numbered set of blocking quality gates. Add future gates here for other cross-game asset contracts such as scale, pivot, root motion, collision proxies, animation semantics, or material compatibility. A gate applies automatically when its asset type is present; do not ask the end user to opt into it or choose technical calibration values that the asset can be inspected to determine.

### Gate 1 — Character forward-axis and orientation acceptance

Character orientation is an asset-integration and movement-kinematics contract. It is not a cosmetic guess and it does not pass merely because controller math is internally consistent.

1. Never assume that a GLB visually faces `+Z`, `-Z`, `+X`, or `-X` from Three.js conventions, generation prompts, filenames, rig type, or a previous asset.
2. Independently determine the native visual forward axis for every player, NPC, enemy, or other direction-sensitive model. Inspect, in priority order:
   - explicit trusted asset metadata;
   - face/head geometry, feet, torso, accessories, and bind-pose/bone layout;
   - a multi-angle rendered preview;
   - a temporary in-game axis/debug-arrow view.
3. Do not infer forward solely from the T-pose left/right axis. Use at least one facial or rendered cue because a valid left/right axis still leaves two opposite forward directions.
4. Record the audit in `asset_manifest.json` under `asset.orientation`, including `nativeForwardAxis`, `canonicalForwardAxis`, `calibrationYawDegrees`, `auditMethod`, `sourceHash`, and `status`.
5. Invalidate the audit whenever the base GLB content hash changes. Regeneration, re-rigging, mesh replacement, or export-axis changes require a new audit even when the asset id and filename are unchanged.
6. Separate gameplay and visuals:
   - the gameplay root owns position, collision, movement velocity, and movement yaw;
   - the visual model is a child and receives exactly one asset-specific calibration rotation;
   - do not distribute compensating rotations across movement, camera, animation, and mesh code.
7. Derive gameplay yaw from the actual normalized horizontal velocity, not directly from the pressed key or an animation state:

```js
const movementYaw = Math.atan2(actualVelocity.x, actualVelocity.z);
gameplayRoot.rotation.y = movementYaw;
visualRoot.rotation.y = auditedCalibrationYaw;
```

8. Verify the composed visual forward direction against actual horizontal velocity for forward, backward, left, right, and all four diagonals:

```js
const worldVisualForward = auditedNativeForward
  .clone()
  .applyQuaternion(visualRoot.quaternion)
  .applyQuaternion(gameplayRoot.quaternion)
  .normalize();

const expectedDirection = actualVelocity.clone().setY(0).normalize();
assert(worldVisualForward.dot(expectedDirection) >= 0.95);
```

9. Protect test independence. The expected native-forward vector must come from the manifest audit or an independent rendered/geometry inspection. Never use the same unverified production constant as both the implementation input and the test oracle. Such a test proves only mathematical self-consistency and is a false positive for visual orientation.
10. Perform at least one rendered acceptance check after integration:
    - pressing forward in a chase-camera view visibly shows the character's back;
    - rotating the camera and pressing forward moves along the new camera direction;
    - face, torso, feet, movement velocity, and active walk/run animation agree;
    - capture a screenshot or short frame sequence as evidence.
11. Prefer the existing asset preview or an offline/local renderer for this check. The bundled preview page provides an isolated turntable for exactly this: `/regeneration.html?audit=<assetId>` (or `?glb=<url>`) renders the model on a pure background at labeled 45-degree yaw steps (front at yaw 0 = native `+Z`, 90 = `+X`, 180 = `-Z`, 270 = `-X`), and `scripts/record-orientation.mjs --cwd <dir> --asset <id> --front-yaw <deg>` writes the measured axis, mechanical calibration angle, and content hash into `asset.orientation` at `AXIS_AUDITED`. In-game frames can be occluded or ambiguous (a side-on frame is not a front), so an unreadable frame is not evidence. If interactive browser/computer control requires authorization and is unavailable, use another independent rendered inspection path when possible. Do not bypass the gate by silently reclassifying a vector test as visual verification.
12. Use exactly one of these verification states:
    - `UNVERIFIED`: the native visual forward axis has not been independently established.
    - `AXIS_AUDITED`: the native forward axis was established from asset inspection.
    - `MATH_VERIFIED`: the audited axis and actual movement pass all direction-vector tests.
    - `VISUALLY_VERIFIED`: rendered movement was inspected, but mathematical coverage is incomplete.
    - `ACCEPTED`: both mathematical direction coverage and rendered acceptance passed.
13. Report the verification level exactly. If rendering cannot be verified, say `Math verification passed against an audited axis; rendered acceptance is pending.` Never report `character orientation passed`, `visual verification passed`, or `ACCEPTED` from mathematical self-consistency alone.
14. Keep this gate invisible to the end user during normal successful generation. Only surface it when the audit is blocked, the asset is ambiguous after inspection, or acceptance fails and requires a user decision beyond the supplied asset/game scope.

## Third-Person Escape Room Game Generation

Use the bundled subskill [third-person-escape-room-game](subskills/third-person-escape-room-game.md) when the user asks to build, regenerate, or substantially revise a browser-runnable third-person top-down 3D escape room game from a supplied script. Load that subskill before planning, coding, asset selection, control implementation, collision work, or playtest reporting for this game type.

## Mandatory Final Game QA, Fix, And Acceptance

Whenever this skill builds, regenerates, or substantially revises a playable browser game, load and complete [game-final-playtest-fix-acceptance](subskills/game-final-playtest-fix-acceptance.md) after implementation, asset integration, and the runnable build are ready. Treat it as a blocking completion gate: run the independent senior QA pass, preserve the initial issue report, repair defects, retest, and emit one of its exact acceptance statuses before declaring the game complete. Do not run this gate for an asset-only request that does not create or revise playable game behavior.

## Existing GLB animation clip generation

### Mechanical rigid-part animation

For vehicles, machines, doors, fans, wheels, rotors, turrets, and similar rigid moving parts, do not default to character rigging. When Tripo returns a static GLB but the requested motion is a rigid rotation or translation, use this workflow:

1. Inspect the GLB scene graph and mesh connectivity to identify the intended moving component; never classify it from the prompt or coordinates alone.
2. If the component is a distinct node or separable connected mesh, split it into its own node while preserving materials, normals, UVs, and transforms.
3. Infer the pivot and motion axis from component bounds, symmetry, attachment geometry, and the requested behavior. Treat the result as unverified when those cues disagree.
4. Author a native glTF translation/rotation animation clip, use a stable semantic name such as `RotorSpin` or `DoorOpen`, and export a new GLB without overwriting the static source.
5. Verify that the output GLB loads, contains the expected nodes and animation channels, and keeps non-moving geometry stationary. Preview at least one animation cycle before marking it ready.
6. Record the clip in manifest `actions` and label its source `native_gltf_animation` or `procedural_native_clip`; do not describe it as a Tripo-generated animation.

Use this path only with high-confidence component separation and pivot inference. If the moving part is welded into the body, shares triangles with unrelated geometry, or has an ambiguous pivot, do not guess destructively: keep the static GLB, use a runtime group animation only when the whole group is the intended moving part, or report that the asset needs regeneration with explicitly separated parts. Model-specific coordinate thresholds and segmentation scripts are one-off artifacts, not reusable defaults.

Use the bundled subskill [tripo-rig-clip](subskills/tripo-rig-clip.md) when the user asks to animate, rig, auto-rig, retarget, or add idle/walk/run/jump clips to an existing GLB or Tripo task. Also treat it as the required continuation of the `gemini_reference` route for character/creature assets. Load that file before doing existing-GLB animation work or explaining the Gemini character pipeline.

## Failure handling

- Remote call blocked by policy or asset API unreachable: report that the asset service is temporarily unavailable. Do not ask for credentials and never silently substitute placeholders for requested GLB generation.
- Gemini reference generation unavailable: the client retries the same assets once through `tripo`, then reports a concise failure if that also fails. GLBs delivered through this tripo fallback are static like any tripo-route GLB (see Route choice for the task-id mechanism): character/creature assets arrive without a skeleton or retarget clips, and runtime animation falls back to procedural/group animation.
- Zero Tripo balance: do not retry in a loop. Keep fallbacks and record the skipped stage in the README.
- Partial success: use generated assets that succeeded and fallback geometry for the rest.
- Portal `401`: stop and ask for a valid `SHARK_PORTAL_TOKEN`.
- Portal `413`: reduce only the built artifact size (for example compress textures/audio or remove unused build assets), rebuild, and run `check` again.
- Portal `422`: fix the reported static-build/path/metadata issue locally and rerun `check`; never bypass the validation by uploading the project root.
- Portal `409` or a transient network failure: retry the identical checked build so the same `clientUploadId` is reused. Do not change metadata merely to force a duplicate upload.
