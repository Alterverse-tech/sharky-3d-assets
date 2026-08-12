# Asset Center Character Workflow

This plugin lets Codex Desktop or Claude Code discuss and prepare a human character, then create and advance the same owner-scoped workflow shown by the browser-hosted Asset Center Character Workbench.

The native host owns conversation and temporary concept images. After an explicit choice, the selected image becomes the workflow's `Uploaded source`; Asset Center remains authoritative for workflow state, GLB, rigging, actions, validation, and publishing.

On Codex Desktop with native image generation, the plugin securely materializes the active source, lets Codex generate and review exactly one T-Pose per approved attempt, then imports that image and its quality report into the same Workbench canvas. It does not call the backend image-analysis or T-Pose-generation stages on that branch. Claude Code and hosts without native image generation retain the existing backend analysis and explicitly approved T-Pose generation path.

After the user's prerequisite choice is explicit, the native agent starts Rig Check with existing automatic rig continuation after the final static model is confirmed, and starts Retarget after actions are selected. T-Pose attempts, static-model generation and candidate choice, and publishing still require explicit confirmation.

Ready GLB results include a durable anonymous `/asset-center/preview/aca_...` link. It opens the GLB directly and refreshes its short-lived storage target on page load. The Character Workbench canvas remains a separate `workbenchUrl`. A completed Retarget workflow prefers the first selected action for the summary link and returns one direct auto-playing action-viewer link per successful action.

Every current ready GLB delivery also includes its server-assigned file name and a freshly signed download URL. Completion reports must show direct preview, download, and Workbench links for every model or action file they name.

Authentication uses Asset Center OAuth with `assets.read` and `assets.write`, or an existing `ASSET_CENTER_SERVICE_TOKEN` for controlled development. The MCP server exposes ten tools, including bounded local source materialization and multipart Codex T-Pose attachment alongside create, attach, get, wait, stage start, output confirmation, action selection, and publish.

First-release scope is human bipeds. Creature requests are recognized but never sent into the biped pipeline.

## Installation

This plugin is distributed from the `sharky-3d-assets` marketplace at `https://github.com/Alterverse-tech/sharky-3d-assets`, side by side with the `shark-game-assets` Skill and the `asset-center-personal-assets` Plugin.

Codex:

```bash
codex plugin marketplace add Alterverse-tech/sharky-3d-assets --ref main
codex plugin add asset-center-character-workflow@sharky-3d-assets
```

Claude Code:

```bash
claude plugin marketplace add Alterverse-tech/sharky-3d-assets
claude plugin install asset-center-character-workflow@sharky-3d-assets
```

## Lightweight update checks

Since `0.3.1` the macOS background updater is replaced by one best-effort check when the skill is first used in a new Codex task or Claude Code session. A failed or inconclusive check is silent and never blocks character work. A proven newer semantic version is announced, but installation starts only after the user asks to update and applies to the next task or session.

Version `0.4.0` moves distribution to the `sharky-3d-assets` Git marketplace. Installations from the retired `asset-center-local` marketplace should migrate once: remove the plugin and the `asset-center-local` marketplace with the host's official plugin CLI, then install `asset-center-character-workflow@sharky-3d-assets` as shown above. Future checks use the host-managed marketplace cache; the plugin never clones repositories, edits caches, or installs a scheduler.
