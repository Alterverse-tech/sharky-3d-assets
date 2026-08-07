---
name: asset-center-personal-assets
description: Use when a Codex game project needs to find, preview, choose, import, or inspect the current user's personal GLB models from Asset Center — including when the user describes a game/story to build and their existing assets should become development context.
---

# Asset Center Personal Assets

Use the Asset Center MCP tools to bring the user's own models into the game as immutable, verified local GLB packages. Treat the local package and lock file as the integration boundary.

## Two entry modes

**A. 直接找模型（direct lookup）** — the user names a specific asset ("把我那个复古飞机拉进来"): `search_personal_assets` → confirm if ambiguous → `pull_asset_to_workspace`.

**B. 剧本/需求驱动（story-driven manifest）** — the user describes a game, story, or scene to build ("根据这个剧本做一个 threejs 游戏"). Follow the manifest workflow below. This mode is the default whenever game development starts and the user's library may be relevant.

## Manifest workflow (mode B)

1. **Extract requirements.** From the story/prompt, list the entities the game needs: characters (+ required actions like walk/run/attack), props, environment pieces, vehicles.
2. **Read the library once.** Call `list_asset_catalog`. The response is grouped in this fixed order: 静态 GLB → 动作 GLB → 程序道具. Each entry carries life `classification` (人物、人物动作、汽车、飞机、轮船、球类等), semantic `tags`, `description`, `animations`, and `sizeBytes`. A rigged character root remains a 静态 GLB; each independent action GLB is a separate 动作 GLB linked by `parentAssetId`. Match entries to requirements **semantically in-context** — synonyms, 中英互通, style hints. Do not fire many keyword searches.
3. **Build the sourcing proposal.** Call `propose_asset_manifest` with the model/action requirements, default source, recommendations, alternatives, reasons, confidence, and action scenes. It is a data tool: it fetches the catalog exactly once and returns either the legacy manifest shape or `shark-asset-sourcing-proposal`. A catalog query failed result must be reported as `query failed / 库存查询失败或暂不可用`; never turn an API/auth failure into “no assets”.

4. **Render one progressive board.** Pass the complete proposal to `render_asset_sourcing_board`. In MCP-Apps-capable hosts this opens a native-feeling fullscreen Widget built with Apps SDK UI. The board shows project reuse, Asset Center recommendations/alternatives, generation, runtime, and fallback choices. Each character's actions are nested under its selected static GLB. Candidate rows use thumbnails and one focused 3D inspector; they do not mount one preview iframe per asset. In plain hosts, render the same structured proposal as a markdown table:

   | 游戏需求 | 推荐资产 | 类别 | 分类 | 描述 | 动画 | 大小 | 状态 |
   |---|---|---|---|---|---|---|---|
   | 主角骑士 | Rusty Knight | 静态 GLB | 人物 | 可复用骑士基础模型 | walk, attack | 12MB | ✅ 推荐 |
   | 城堡场景 | Castle Gate | 静态 GLB | 建筑 | 石制城堡大门 | – | 55MB | ◻ 备选（偏大） |
   | 巨龙 Boss | — | – | – | – | – | – | ❌ 缺失 → 建议去资产中心生成 |

   Default recommendation = the best match per requirement; list runners-up as 备选. A static character GLB remains useful even when no action GLB matches, because the user may choose a supported generated-action route or runtime action.
5. **Wait for one final confirmation.** The only primary action is `确认资产方案并开始制作`. The Widget calls `confirm_asset_sourcing_plan`, which validates and freezes the complete choice set but does not import or generate. In plain hosts, obtain the same one final confirmation in chat. Never import before this confirmation.
6. **Import only the confirmed reuse set.** Call `pull_asset_to_workspace` once per final `reuse_asset_center` model/action (`public/assets/asset-center` when the project has `public/`; otherwise `assets/asset-center`). Then return each verified `modelPath`, SHA-256, and size to the orchestrator. Generation and runtime decisions remain context for Shark Game Assets; this Plugin does not execute them.
7. **Report gaps.** Return final `generate_new`, `generate_action`, runtime, and fallback choices to the orchestrator. 程序道具 catalog entries are context only — mention them when relevant, do not pull them.

## Rules

- Never ask the user to paste a Service Token into chat or source code. If authentication is missing, tell them to set `ASSET_CENTER_SERVICE_TOKEN` in their local Codex environment.
- Do not pull assets merely because they matched. Pull only what the user confirmed.
- A `reuse_linked_action` must have `parentAssetId` equal to the selected base character asset id. Clear the old action choice whenever the base changes. Cross-character reuse requires verified compatibility evidence.
- Never use a signed download URL in game code. The pull tool exchanges it internally and returns only workspace-relative paths.
- Do not overwrite an existing package when its SHA-256 differs. Surface the conflict and ask whether the user wants a separately named/versioned import.
- Preserve `asset-center.lock.json`; use `inspect_imported_assets` to understand existing imports before proposing a manifest (already-imported assets show as ✅ 已导入, no re-pull).
- This plugin imports published GLBs. It does not generate, edit, upload, or publish assets.

## Common prompts

- “根据这个故事做一个 threejs 小游戏。”（→ manifest workflow）
- “看看我资产中心里有哪些带动画的角色。”
- “把我那个复古飞机模型拉进当前游戏。”
- “列一下这个项目已经导入的 Asset Center 模型。”
