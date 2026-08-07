# Asset Center Personal Assets Codex Plugin

This plugin lets Codex read the current Asset Center owner's complete library in grouped Static GLB, Action GLB, and Procedural Prop sections, show candidates for selection, and import verified local GLB copies into a game workspace.

Version `0.4.5` renders the sourcing gate as a complete asset confirmation table with exactly ten columns: 角色/实体、资产需求、选项、候选方案（点击预览）、模型来源、动作、触发场景、动作来源、复用状态、当前选择. Every asset requirement expands into A/B/C-style single-choice rows. Only real Asset Center candidates appear, their names open HTTP/HTTPS preview pages, linked actions remain conditional on the selected base, and changing the base resets incompatible actions. The footer contains only the final confirmation button; no cost or summary statistics are displayed.

## Configure

1. Sign in to Asset Center and create a Service Token from the account menu. Give it a dedicated application id such as `codex-local-your-name`.
2. Keep the token local. Do not commit it or paste it into chat.
3. Set the environment before starting Codex:

```bash
export ASSET_CENTER_SERVICE_TOKEN="your-local-service-token"
export ASSET_CENTER_CODEX_API_BASE_URL="https://studio.13-216-49-19.sslip.io/codex/v1"
```

`ASSET_CENTER_CODEX_API_BASE_URL` is optional; the production URL above is the default.

## Install

```bash
codex plugin marketplace add Alterverse-tech/sharky-3d-assets --ref main
codex plugin add asset-center-personal-assets@sharky-3d-assets
```

Restart Codex after changing the environment or plugin installation.

## Automatic updates

Whenever Codex starts this Plugin's MCP process, the bootstrap performs one best-effort refresh of the fixed `sharky-3d-assets` Git marketplace. If it finds a newer semantic version, it installs that Plugin and launches the newer MCP server immediately in the same Codex session. An 8-second total timeout, an unavailable network, or an invalid update falls back to the bundled server; update diagnostics go only to stderr and never include the Service Token.

This activation is owned by the Plugin, not by `shark-game-assets`. In the normal game flow, the first Asset Center tool request is what makes the Plugin relevant; direct Asset Center prompts work independently. Set `ASSET_CENTER_PLUGIN_AUTO_UPDATE=0` only when a local development session must remain pinned.

## Use

Open a game project and ask:

```text
显示我 Asset Center 里带动画的角色，先让我选择，再拉到当前游戏项目。
```

Codex searches only the token owner's published GLBs. After selection, the plugin creates:

```text
public/assets/asset-center/<name>--<asset-id>/model.glb
public/assets/asset-center/<name>--<asset-id>/asset.json
asset-center.lock.json
```

The importer validates byte size, SHA-256, and the GLB header. Repeating the same import is idempotent; a changed hash is never overwritten silently.

## Available tools

- `list_asset_catalog`: read the complete library grouped as 静态 GLB → 动作 GLB → 程序道具, including classification, description, animations, size, and base/action relationships.
- `propose_asset_manifest`: read one catalog snapshot and build a data-only legacy manifest or progressive sourcing proposal.
- `render_asset_sourcing_board`: render a prepared proposal as the compact Apps SDK UI selection table; it never reads the catalog again.
- `confirm_asset_sourcing_plan`: validate and freeze the one final confirmation; it does not import or generate.
- `search_personal_assets`: search and paginate the owner's GLBs.
- `get_personal_asset`: read metadata and the stable preview page URL.
- `pull_asset_to_workspace`: issue a one-time receipt, download, validate, and package one GLB.
- `inspect_imported_assets`: read the workspace lock file.

## Troubleshooting

- `ASSET_CENTER_SERVICE_TOKEN is required`: export the token in the environment used to launch Codex, then restart it.
- `Invalid Service Token`: create a new token in Asset Center and replace the local environment value.
- `refusing to overwrite`: the remote asset changed after a previous import. Keep the existing package or deliberately choose a separate versioned location.
- Catalog query failed: report the library as unavailable and retry; do not report a failed request as an empty catalog.
- Action mismatch: a linked action's `parentAssetId` must match the selected base character before import.
