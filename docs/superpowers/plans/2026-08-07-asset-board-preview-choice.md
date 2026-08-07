# Asset Board Preview Choice Implementation Plan

> **For agentic workers:** Execute inline in this task; subagent dispatch is disabled. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep 角色/实体 labels concise and let users choose Codex in-app preview or the system browser for every Asset Center preview URL.

**Architecture:** Add an optional `entityLabel` to the sourcing proposal contract and use a bounded fallback label for older proposals. Replace direct preview links with an accessible two-action menu: the system-browser action uses the external-link bridge, while the Codex action sends a URL-bearing follow-up request for the current task to open with Codex Browser.

**Tech Stack:** React, TypeScript, MCP Apps JSON-RPC bridge, esbuild, Node.js bench scripts.

## Global Constraints

- Preserve the ten-column table and single-choice asset behavior.
- Never append `tier` values such as `(key)` to 角色/实体.
- Preserve the user's uncommitted `README.md` and `.idea/` files.
- Run only focused repository benches and rebuild the checked-in Widget bundle.
- Publish as Plugin version `0.4.7`, merge to `main`, push both existing tag families, and refresh the installed marketplace Plugin.

---

### Task 1: Add failing contract checks

**Files:**
- Modify: `tests/asset-sourcing-plan-bench.mjs`
- Modify: `tests/plugin-package-bench.mjs`

- [ ] Assert `entityLabel` survives proposal and confirmed-plan normalization.
- [ ] Assert the Widget no longer renders `slot.tier` and contains both preview destinations.
- [ ] Run both benches and confirm the new assertions fail before implementation.

### Task 2: Implement concise labels and preview destination menu

**Files:**
- Modify: `plugins/asset-center-personal-assets/scripts/sourcing-contract.mjs`
- Modify: `plugins/asset-center-personal-assets/scripts/asset-center-personal-assets-mcp.mjs`
- Modify: `plugins/asset-center-personal-assets/web/src/AssetSourcingBoard.tsx`
- Modify: `plugins/asset-center-personal-assets/web/src/bridge.ts`
- Modify: `plugins/asset-center-personal-assets/web/src/styles.css`
- Regenerate: `plugins/asset-center-personal-assets/web/dist/asset-sourcing-board.js`
- Regenerate: `plugins/asset-center-personal-assets/web/dist/asset-sourcing-board.css`

- [ ] Add optional `entityLabel` (`1..40` characters) to the tool schema and proposal/plan contract.
- [ ] Render `entityLabel` or a safely shortened legacy name, without tier suffixes.
- [ ] Add an accessible preview menu with `在 Codex 中打开` and `在系统浏览器打开`.
- [ ] Build the Widget and rerun focused benches.

### Task 3: Document and publish Plugin 0.4.7

**Files:**
- Modify: `plugins/asset-center-personal-assets/.codex-plugin/plugin.json`
- Modify: `plugins/asset-center-personal-assets/scripts/asset-center-personal-assets-mcp.mjs`
- Modify: `plugins/asset-center-personal-assets/README.md`
- Modify: `plugins/asset-center-personal-assets/skills/asset-center-personal-assets/SKILL.md`
- Modify: `shark-game-assets/SKILL.md`
- Modify: `tests/plugin-package-bench.mjs`

- [ ] Bump the manifest/server/resource URI to `0.4.7`/`v5` and update the operating contract.
- [ ] Commit only feature files, fast-forward `main`, and push `main`.
- [ ] Create and push `v0.4.7` and `asset-center-plugin-v0.4.7`.
- [ ] Upgrade the local marketplace and Plugin, then verify the installed version is `0.4.7`.
