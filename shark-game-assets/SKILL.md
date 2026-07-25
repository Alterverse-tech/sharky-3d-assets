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

- For every task that generates, regenerates, rigs, animates, or integrates GLB assets, create or restore the canonical local preview/progress page by default, even when the user did not ask for it. Make the current-run plan and preview setup the first local asset action after locating the workspace, before remote calls or GLB integration, then keep status synchronized until the task finishes.
- Skip the default preview only for publish-only requests, help/explanation-only requests, readiness-only or other read-only inspection that does not generate/integrate asset files, or when the user explicitly declines a preview page.
- If the game prompt contains explicit or implicit entities, such as a player, character, enemy, collectible, vehicle, weapon, obstacle, boss, mascot, key prop, or environment object, GLB generation is a required stage when the tool is available.
- Generate only 1-3 key assets by default. Prioritize the player/main character first, then the gameplay-critical enemy, collectible, vehicle, hazard, or key prop. Do not generate decorative filler.
- When the user explicitly asks to regenerate a game and says not to reuse historical assets, do not reuse existing GLBs from `asset_manifest.json`; create fresh stable ids, usually with a timestamp or run suffix, and pass `force: true`.
- For regeneration work with concrete characters or critical entity props, use the Gemini-Tripo branch (`route: "gemini_reference"`) for those key assets and keep that set to 1-5 models total. If the client/API batch cap is lower than the requested total, split into multiple generate calls.
- For secondary static props that do not need strong visual control or rigged animation, use the faster Tripo branch (`route: "tripo"`) and keep that set to 3-10 models total. Do not include decorative filler just to reach the lower bound.
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
- The setup and synchronizer are local-only, so restore or create the preview before the first remote call. If remote access later fails, leave the page available with pending status. For integration-only work with existing local GLBs, create the preview before modifying game integration code.
- Keep this preview website lightweight and standardized so it does not materially slow the game generation task. Copy the template, write/update JSON, bundle the preview script, and start or reuse the local static/dev server; do not redesign the page or add custom UI unless the user explicitly asks.
- Treat the bundled template files in `templates/regeneration/` as the canonical source of truth for `/regeneration.html`, not as loose inspiration. In the blood moon castle project this canonical page is served as `http://127.0.0.1:4173/regeneration.html`; if the dev server uses a different port, keep the same path and UI structure. Do not scrape or download the localhost URL at runtime; that URL is only a served instance of the bundled template.
- When a project is missing this page, or when the page has drifted from the contract, run `setup-regeneration-preview.mjs`. It restores the canonical HTML/source, initializes missing plan/status files, bundles the viewer, and writes a content-hash cache buster into the script URL.
- Preserve or recreate the same DOM contract: `.app` grid root, left `aside`, right `main`, `#list` for item buttons, `#stage` for the Three.js canvas, `.status#status` for the compact status panel, and `<script src="./regeneration-preview.bundle.js"></script>`.
- Preserve or recreate the same visual contract: dark `#11141b`/`#191d25` page, 360px left column on desktop, responsive two-row mobile layout, compact 8px-radius item buttons, progress bars with `#e5b76c`, green ready border, amber active state, right-side full-height viewer, bottom overlay status panel.
- Preserve or recreate the same viewer behavior in `src/regeneration-preview.js`: poll `./regeneration-status.json` every 2 seconds with cache disabled, render base and action GLBs as separate left-side buttons with status/progress/filename, disable buttons until `runtimeUrl` exists, load completed GLBs with `GLTFLoader`, use `OrbitControls`, normalize each model to fit the viewer, auto-load the first ready action or model, and rotate the current model slowly.
- For action previews, load the visible base model first, load the action GLB only as an `AnimationClip` source, and play it through one mixer on the base root. If the clip cannot bind the base skeleton, directly display the action GLB scene and state that fallback in the status overlay.
- Do not redesign, theme, simplify, or move this page during asset work unless the user explicitly requests a different preview UI. If the page already exists, reuse it and update its current-run plan/status; if it is missing, rebuild it to this canonical contract before asset generation, animation, or integration starts.
- After editing or regenerating the page, run the bundled validator before claiming it is ready. It checks the DOM/viewer contract, plan/status schemas, action slots, safe runtime paths, and every ready GLB on disk:

```bash
node <skill-dir>/scripts/validate-regeneration-preview.mjs --cwd "$(pwd)"
```
- Back the page with derived status JSON at `public/regeneration-status.json`, containing per-asset `id`, `name`, `role`, `status`, `progress`, `runtimeUrl`, `clips`, and `error`. Keep the synchronizer running throughout generation so the page can poll and refresh without browser automation.
- The status JSON should make semantic model state visible, not just raw file completion. For animated character/creature assets, list the base model and each semantic action GLB separately or expose them in `clips`, for example player base, player `idle`, player `walk`, boss base, boss `idle`, boss `walk`. This helps users and Codex verify that the correct action GLB is used at the correct gameplay state.
- During generation, derive each status item from `pending` to `running` to `ready` or `failed`, with progress and a clear error if one stage fails. Server-side `success` without a local runtime GLB stays `running` at no more than 99%; only a non-empty file under `public/generated-assets/` may become `ready`.
- As each GLB completes, copy it into the runtime `public/generated-assets/` tree, set `runtimeUrl`, and make it available in the live preview before the full batch is complete.
- On completion, update `asset_manifest.json`, game asset constants/import paths, and the preview status so they list the assets/actions actually used by the current task. For explicit no-reuse regeneration, this set must contain only fresh current-run GLBs.
- Keep primitive fallbacks in the game for failed slots, but do not silently replace a failed regenerated asset with an older GLB.

Default asset-preview checklist:

1. Restore `public/regeneration.html`, `src/regeneration-preview.js`, `public/regeneration-status.json`, and `public/regeneration-preview.bundle.js` from the template contract.
2. Create `regeneration-plan.json` with a fresh run identity and every base/action slot, then start `sync-regeneration-status.mjs --watch`.
3. Start or reuse the local static/dev server and verify with `lsof` plus `curl` that the reported loopback URL serves this project rather than a stale listener.
4. Run the asset generation or regeneration calls, preferably under `.asset-batches/<batch-name>` when split batches are required.
5. After each model or retarget action completes, copy the GLB to `public/generated-assets/`; the synchronizer validates the file and exposes it immediately.
6. After all tasks finish, update `asset_manifest.json` and game code using the same semantic mapping shown in the preview page.
7. Run `validate-regeneration-preview.mjs` before claiming the preview website is ready.

## Route choice

Use `tripo` for the fast route: direct text prompt to Tripo3D text-to-model. This is best for generic props, enemies, collectibles, vehicles, obstacles, and fast iteration. A tripo-route GLB is delivered static and stays static: the local manifest carries no Tripo task id (the client strips provider task ids during anonymization), while the rig/retarget flow requires `originalModelTaskId`, so a tripo-route GLB cannot enter the `tripo-rig-clip` flow afterwards. For skill-generated assets, rigged characters with retarget clips come only from the `gemini_reference` route completing its server-side rig stage; separately, a Tripo task id the user supplies from their own account can enter the `tripo-rig-clip` flow directly.

Use `gemini_reference` when visual control matters; this is the Gemini-Tripo branch when the user describes it that way. Gemini first creates a pure-white-background reference image, then Tripo image-to-model creates the GLB. For `assetKind: "character"` or `"creature"`, this route must continue into the `tripo-rig-clip` flow so the final manifest contains a rigged main GLB plus default `idle` and `walk` animation support. Prefer this route when the user mentions Gemini, Nano Banana, T-pose, white background, reference image, image-to-model, character sheet, style consistency, or when a key character's silhouette must be controlled.

Use `auto` only when you are comfortable with the server choosing from the prompt. If in doubt, choose the route yourself and pass it explicitly.

## Environment

The generation client is bundled with this skill at `scripts/game-assets-mcp.mjs` (Node >= 20, zero dependencies). It talks anonymously to the default public asset API at `https://studio.13-216-49-19.sslip.io`.

- `GAME_ASSETS_API_URL` — optional override for the asset API base URL
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
[$shark-game-assets](/Users/cppeng/Documents/study/.agents/skills/shark-game-assets/SKILL.md) 请给这个已有角色 GLB 自动 rig，并生成 idle 和 walk 动作 clips。每个动作单独输出 GLB，不要把多个 retarget preset 合并成一次请求。
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
请用 Gemini 先为我描述的角色生成白底参考图，再用 Tripo 生成游戏角色 GLB。角色需要清晰轮廓、T-pose、可用于 Three.js，并带 idle/walk 动作。
```

## Asset tool workflow

For asset generation or integration tasks, prefer MCP tools named `mcp__game_assets__*` when available. Otherwise run the bundled client via Bash. Both expose the same readiness, generate, and animate operations. Skip this workflow for a publish-only request.

1. Run `pwd` if you do not already know the current workspace path.
2. Write the current task's actual `regeneration-plan.json`, then create/restore the preview, reset derived status for that plan, and start the synchronizer before making any asset API call or changing integration code:

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

   Start or reuse a local server and provide `/regeneration.html` early when practical. For an integration-only task with existing local GLBs, populate the plan from `asset_manifest.json`, run the same setup/synchronizer, and make existing base/action GLBs previewable before changing integration code. These preview actions are local-only.
3. Call the configured public asset API without requesting or sending a login or client token. Platform or sandbox restrictions still apply.
4. If planning 3 or more assets, or if this is the first asset generation in the thread, check readiness (`<skill-dir>` is this skill's directory):

```bash
node <skill-dir>/scripts/game-assets-mcp.mjs readiness --cwd "$(pwd)"
```

5. Generate the selected asset set. By default generate 1-3 assets (batch max 4). For explicit game-regeneration requests, follow the quantity limits above: 1-5 Gemini-Tripo key entity models, and optionally 3-10 Tripo static prop models. Split into multiple generate calls when a desired set is larger than the current client/API batch cap. Pass parameters as one JSON object:

```bash
node <skill-dir>/scripts/game-assets-mcp.mjs generate --cwd "$(pwd)" --params '{
  "gamePrompt": "...",
  "route": "tripo",
  "assets": [{ "id": "...", "role": "player", "name": "...", "prompt": "..." }]
}'
```

   - `route`: `tripo`, `gemini_reference`, or `auto`.
   - `assets`: objects with stable kebab-case `id`, `role`, `name`, `prompt`, and optionally `assetKind`; keep counts within the default or regeneration-specific limits.
   - On `gemini_reference`, character/creature assets are automatically rigged after GLB generation. Prefer `animationClips` when present; if Tripo retarget failed, expect main-GLB fallback fields `animations: ["Idle", "Walk"]` and `animationSource: "procedural_native_clips"`.
   - `force`: only when the user explicitly asked to regenerate assets.
   - The command reports concise progress on stderr while polling (typically 1-3 minutes per batch), then prints JSON on stdout; exit code 1 means the batch failed.
6. After the command returns, read `asset_manifest.json` from `cwd`. Treat that file as the source of truth and keep the preview synchronizer running until every successful local GLB/action appears.
7. Wire `manifest.assets` into the game code with Three.js `GLTFLoader`. Treat the manifest as a semantic registry: choose assets by `bindings`, `id`, or `role`, and choose animations by `actions.<name>.url` or legacy `animationClips[].name`/`preset`, never by guessing file names or folders.
8. Keep a local primitive fallback for every generated asset. The game must remain playable when a GLB fails to load.
9. Run `validate-regeneration-preview.mjs`, then stop the synchronizer normally after final status and manifest are stable.

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
      "prompt": "original low-poly astronaut cat hero, round helmet, compact readable silhouette, blue and white suit, friendly arcade game character"
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
        "idle": {
          "url": "/generated-assets/idle-task/model.glb",
          "format": "glb",
          "source": "tripo_retarget_clip",
          "preset": "preset:biped:idle",
          "loop": true,
          "rootMotion": "none"
        },
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
        "default": "idle",
        "stand": "idle",
        "move": "walk",
        "moving": "walk"
      },
      "fallback": {
        "model": "primitive:humanoid",
        "animation": "group-bob-tilt"
      }
    }
  ]
}
```

Manifest authoring rules:

- `model.url` is the visible base model or base rig. It is not automatically the `idle`, `walk`, or `run` action.
- `actions` is the primary action registry. Runtime code should resolve `walk` from `asset.actions.walk.url`, `idle` from `asset.actions.idle.url`, and so on.
- `bindings` maps game slots to asset ids. Prefer `manifest.bindings.player` over searching for the first asset with `role: "player"` when a binding exists.
- `role` and `gameplayRole` should describe game semantics such as `player`, `boss`, `npc`, `collectible`, or `hazard`. `assetKind` should describe asset form such as `character`, `creature`, `prop`, `vehicle`, or `environment`.
- `orientation` records the independently audited native visual forward axis and the one-time calibration into the game's canonical forward axis. Do not write `VISUALLY_VERIFIED` or `ACCEPTED` unless the mandatory orientation gate below has passed at that level.
- Keep legacy `url`, `animationClips`, `animations`, and `animationSource` fields readable for backward compatibility, but normalize them into `model` and `actions` at runtime before use.

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
4. Load each action GLB with `GLTFLoader` from `getActionUrl(asset, "idle")`, `getActionUrl(asset, "walk")`, and any other required actions.
5. Extract `THREE.AnimationClip`s from the action GLBs' `gltf.animations`; do not add those action GLB scenes to the game scene unless using the fallback described below.
6. Play those clips on the main character mixer, for example `mixer.clipAction(walkClip, mainRoot)`.
7. Switch actions from game state and call `mixer.update(delta)` every frame.

Minimal Three.js shape:

```js
const mainGltf = await loadGLB(getModelUrl(asset));
const mainRoot = normalizeModel(mainGltf.scene);
scene.add(mainRoot);

const mixer = new THREE.AnimationMixer(mainRoot);
const idleGltf = await loadGLB(getActionUrl(asset, "idle"));
const walkGltf = await loadGLB(getActionUrl(asset, "walk"));

const idleAction = mixer.clipAction(idleGltf.animations[0], mainRoot);
const walkAction = mixer.clipAction(walkGltf.animations[0], mainRoot);

idleAction.play();

function tick(delta) {
  mixer.update(delta);
}
```

## Runtime integration rules

- Normalize every loaded GLB with `THREE.Box3().setFromObject()`: scale to target size, center horizontally, place the bottom at `y = 0`, and apply the independently audited orientation calibration. Never guess a facing offset from engine convention or a previous asset.
- Separate visuals from gameplay hitboxes. Collision should use stable gameplay dimensions, not raw model bounds or mesh origins.
- If `manifest.assets` contains `rigged`, `rigType`, `actions`, `animationClips`, `animations`, or `animationSource`, inspect the loaded `gltf.animations` before claiming native animation exists.
- For `animationSource: "tripo_retarget_clips"` or a character/creature asset with `actions`/`animationClips`, load the visible main model from `model.url` or legacy `url`, then separately load each action GLB from `actions.<name>.url` or legacy `animationClips[].url`. The action GLB scene is normally only a clip source and should not be added to the game scene.
- Extract `THREE.AnimationClip`s from action GLBs and play them on the main model's root with one `THREE.AnimationMixer`, for example `mixer.clipAction(walkClip, mainRoot)`. This depends on the action GLB and main model sharing a compatible rig, which Tripo retarget clips for the same asset are expected to do.
- If `animationSource` is `procedural_native_clips`, play the main GLB's embedded `Idle`/`Walk` clips directly and label them as procedural fallback clips, not Tripo retarget clips.
- When native clips exist, create a `THREE.AnimationMixer`, map clips by case-insensitive substrings such as `idle`, `walk`, `run`, and `jump`, and call `mixer.update(delta)` every frame.
- Drive action switching from game state: idle/stand states should play `idle`, movement should play `walk` or `run`, and jump/air states should play `jump` when available. Use cross-fades when changing between actions.
- If no native clips exist, use whole-group bob/tilt/rotation or explicitly labeled procedural clips as fallback animation.
- If a retarget clip does not bind to the main model's skeleton, fall back to directly displaying the action GLB scene for that state or to a clearly labeled procedural/group fallback. Do not silently claim the main rig is playing that retarget clip.
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
11. Prefer the existing asset preview or an offline/local renderer for this check. If interactive browser/computer control requires authorization and is unavailable, use another independent rendered inspection path when possible. Do not bypass the gate by silently reclassifying a vector test as visual verification.
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
