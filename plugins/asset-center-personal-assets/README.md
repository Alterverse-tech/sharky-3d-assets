# Asset Center Personal Assets Codex Plugin

This plugin lets Codex read the current Asset Center owner's complete library in grouped Static GLB, Action GLB, and Procedural Prop sections, show candidates for selection, and import verified local GLB copies into a game workspace.

Version `0.5.1` makes sourcing choices easier to understand: reusable Asset Center rows read `复用素材: <name>(点击预览)`, while every Three.js fallback reads `使用three.js程序生成`. Version `0.5.0` removes the Service Token setup step: the plugin now signs in through Asset Center's browser authorization page (OAuth 2.1 + PKCE, loopback callback, tokens stored locally and refreshed silently); `ASSET_CENTER_SERVICE_TOKEN` remains an optional override. The sourcing gate is a complete asset confirmation table with exactly ten columns: 角色/实体、资产需求、选项、当前选择、候选方案（点击预览）、模型来源、动作、触发场景、动作来源、复用状态. The 角色/实体 column uses a concise `entityLabel`, is visually capped at two lines, and never appends internal tier values such as `(key)`. Character and creature bases are 人物/主体; non-living bases are 道具 and their action groups are 道具动作. Action rows distinguish direct Asset Center action-GLB reuse, Tripo retargeting from an existing static GLB, and paired new static/action generation. Every asset requirement expands into A/B/C-style single-choice rows. Only real Asset Center candidates appear as native HTTP/HTTPS links: left-click opens in Codex Browser and right-click uses the host's native link menu, including the system-browser option. 刷新资产 asks Codex to reload the complete catalog and rebuild the proposal without importing or generating, while 全屏查看 requests fullscreen from a user click. Linked actions remain conditional on the selected base, and changing the base resets incompatible actions. The footer contains only the final confirmation button; no cost or summary statistics are displayed.

## Sign in (no token configuration needed)

Nothing to configure. The first time a tool needs your library, the plugin opens your browser at Asset Center's authorization page. Sign in the way you normally do — Google or an email verification code — press **允许访问**, and the browser returns to your agent automatically.

Under the hood: OAuth 2.1 authorization code with PKCE, a loopback `127.0.0.1` callback on a random port, and tokens stored only on your machine at `~/.sharky-asset-center/credentials.json` (owner-readable, mode 600). The session refreshes silently, so you sign in once.

Headless or remote session (SSH, container, CI) with no browser? Set `ASSET_CENTER_OAUTH_NO_BROWSER=1`; the plugin prints the authorization link for you to open on any machine.

Optional environment:

```bash
# Optional: skip the browser flow with a Service Token (CI, shared runners, legacy setups)
export ASSET_CENTER_SERVICE_TOKEN="your-local-service-token"
# Optional: point at a non-production Asset Center
export ASSET_CENTER_CODEX_API_BASE_URL="https://studio.13-216-49-19.sslip.io/codex/v1"
```

`ASSET_CENTER_SERVICE_TOKEN`, when present, takes precedence and skips the browser login entirely.

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
- `render_asset_sourcing_board`: render a prepared proposal as the complete Apps SDK UI selection table; it never reads the catalog again.
- `confirm_asset_sourcing_plan`: validate and freeze the one final confirmation; it does not import or generate.
- `search_personal_assets`: search and paginate the owner's GLBs.
- `get_personal_asset`: read metadata and the stable preview page URL.
- `pull_asset_to_workspace`: issue a one-time receipt, download, validate, and package one GLB.
- `inspect_imported_assets`: read the workspace lock file.

## Troubleshooting

- Browser did not open: the authorization link is printed on stderr; open it manually, or set `ASSET_CENTER_OAUTH_NO_BROWSER=1` for headless sessions.
- `等待浏览器授权超时`: the authorization page was not completed within 10 minutes. Re-run the request to start a fresh login.
- `Invalid Service Token` while signed in: the stored session expired and could not refresh. Delete `~/.sharky-asset-center/credentials.json` and sign in again.
- Using an explicit `ASSET_CENTER_SERVICE_TOKEN` and it is rejected: create a new token in Asset Center and replace the local environment value.
- `refusing to overwrite`: the remote asset changed after a previous import. Keep the existing package or deliberately choose a separate versioned location.
- Catalog query failed: report the library as unavailable and retry; do not report a failed request as an empty catalog.
- Action mismatch: a linked action's `parentAssetId` must match the selected base character before import.
