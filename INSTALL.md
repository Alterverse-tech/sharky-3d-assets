# Install Shark Game Assets

This document is an installation contract for coding agents. Follow it when the user asks you to install Shark Game Assets. Codex follows sections 1-4. Claude Code follows the "Claude Code installation" section, which reuses the same component identities and safety rules.

## What you will install

Install both existing components without changing their runtime logic:

- the global `shark-game-assets` Skill;
- the `asset-center-personal-assets` Codex Plugin from the `sharky-3d-assets` marketplace.

Tell the user that these are two components installed through one guided flow. Request normal command approval when the environment requires it.

## Safety rules

- Inspect current state first and run only missing installation steps.
- Preserve unrelated skills, marketplaces, plugins, and Codex configuration.
- Do not remove, overwrite, or silently repair an existing installation.
- Do not use Browser Use or Computer Use for installation.
- Do not ask the user to paste `ASSET_CENTER_SERVICE_TOKEN` into chat and never print its value.
- Treat network, permission, and CLI failures as failures. Do not claim success from a partial or failed command.

## 1. Check prerequisites

Confirm that `node`, `npx`, and `codex` are available. If one is missing, stop and report that exact prerequisite instead of attempting an alternative installer.

## 2. Inspect current state

Run:

```bash
npx skills list -g
codex plugin marketplace list --json
codex plugin list --json
```

Use exact component identities when reading the results:

- Skill: `shark-game-assets`
- Marketplace: `sharky-3d-assets`
- Plugin: `asset-center-personal-assets` from marketplace `sharky-3d-assets`

If an identity exists but points to a different source, stop and report the conflict. Do not replace it automatically.

## 3. Install only missing components

If the global Skill is missing, run:

```bash
npx skills add https://github.com/Alterverse-tech/sharky-3d-assets --skill shark-game-assets -g -y
```

If the marketplace is missing, run:

```bash
codex plugin marketplace add Alterverse-tech/sharky-3d-assets --ref main --json
```

If the Plugin is missing, run this only after the marketplace is available:

```bash
codex plugin add asset-center-personal-assets@sharky-3d-assets --json
```

Leave an already installed component unchanged. If one installation fails, keep any component that installed successfully and report the result as partial installation.

## 4. Verify and report

Run the state checks again:

```bash
npx skills list -g
codex plugin marketplace list --json
codex plugin list --json
```

Report separate results for:

1. `shark-game-assets` Skill;
2. `sharky-3d-assets` marketplace;
3. `asset-center-personal-assets` Plugin.

Do not report complete success unless all three are present with the expected identities.

## Claude Code installation

Claude Code installs the same two components with its own plugin CLI. All safety rules above apply unchanged, including exact component identities and no silent repair of conflicts.

### 1. Check prerequisites

Confirm that `node`, `npx`, and `claude` are available. If one is missing, stop and report that exact prerequisite instead of attempting an alternative installer.

### 2. Inspect current state

Run:

```bash
npx skills list -g
claude plugin marketplace list
claude plugin list
```

Use the same component identities: Skill `shark-game-assets`, marketplace `sharky-3d-assets`, plugin `asset-center-personal-assets` from marketplace `sharky-3d-assets`.

### 3. Install only missing components

If the global Skill is missing, run:

```bash
npx skills add https://github.com/Alterverse-tech/sharky-3d-assets --skill shark-game-assets -g -y
```

If the marketplace is missing, run:

```bash
claude plugin marketplace add Alterverse-tech/sharky-3d-assets
```

If the Plugin is missing, run this only after the marketplace is available:

```bash
claude plugin install asset-center-personal-assets@sharky-3d-assets
```

### 4. Verify and report

Run the state checks from step 2 again and report separate results for the Skill, the marketplace, and the Plugin, following the same partial-installation rules as the Codex flow.

## Authentication boundary

The public Shark Game Assets generation workflow does not require a token. Personal Asset Center access requires `ASSET_CENTER_SERVICE_TOKEN` to be configured locally in the environment that launches Codex. Installation does not require its value and must not request it in chat.

After successful installation, ask the user to start a new task in the installing agent — a new Codex task or a new Claude Code session — so the newly installed Skill and Plugin tools are discovered.
