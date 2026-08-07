# Smooth Agent-Driven Installation Design

## Goal

Give users one prompt to copy into Codex. Codex reads the repository-owned installation contract and installs the existing `shark-game-assets` Skill plus the existing `asset-center-personal-assets` Plugin.

The user-facing prompt is:

```text
Read https://raw.githubusercontent.com/Alterverse-tech/sharky-3d-assets/main/INSTALL.md and install Shark Game Assets for me.
```

The prompt is one action for the user, while the installer still preserves the two existing distribution units.

## Scope

Add two documentation surfaces:

1. Root `INSTALL.md`: an agent-readable, idempotent installation contract.
2. Root `README.md`: a primary one-prompt installation block plus the existing manual commands as a fallback.

Do not bundle the Skill into the Plugin, rename either component, change Skill behavior, change MCP tools, change authentication, or add an executable remote install script.

## Installation Contract

`INSTALL.md` instructs Codex to:

1. State that it will install one global Skill and one Codex Plugin.
2. Inspect current Skill, marketplace, and Plugin state before changing anything.
3. Run only missing installation steps:
   - `npx skills add https://github.com/Alterverse-tech/sharky-3d-assets --skill shark-game-assets -g`
   - `codex plugin marketplace add Alterverse-tech/sharky-3d-assets --ref main`
   - `codex plugin add asset-center-personal-assets@sharky-3d-assets`
4. Preserve existing installations and unrelated marketplaces, plugins, skills, and configuration.
5. Verify the Plugin appears in `codex plugin list --json` and report the Skill and Plugin results separately.
6. Tell the user to start a new Codex task so newly installed skills and tools are discovered.

The agent must request normal command approval when required. It must not use Browser Use or Computer Use, silently delete an old installation, print or request a Service Token in chat, or claim a failed network request is a successful installation.

## Authentication Boundary

The public `shark-game-assets` generation workflow remains usable without credentials. The personal Asset Center Plugin still requires `ASSET_CENTER_SERVICE_TOKEN` in the environment that launches Codex.

Installation does not block on that token. `INSTALL.md` explains the boundary and tells users to configure it locally only when they want personal Asset Center access. It never asks them to paste the token into chat.

## Repeated Runs and Failures

The installation prompt is safe to repeat:

- Already installed components are reported and left unchanged.
- Missing components are installed independently.
- If one component fails, Codex reports that partial state and gives the exact failed step.
- Marketplace or network failures do not trigger alternative scripts or destructive cleanup.

## Acceptance Criteria

- A new user can begin installation by copying one prompt.
- The underlying Skill and Plugin retain their current names, files, and runtime logic.
- Running the prompt again does not duplicate entries or remove configuration.
- The README keeps manual installation commands for users who prefer direct control.
- Verification remains lightweight and checks installation state only.
