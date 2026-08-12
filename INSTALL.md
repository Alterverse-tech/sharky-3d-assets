# Install Shark Game Assets

This document is an installation contract for coding agents. Follow it when the user asks you to install Shark Game Assets. Codex follows sections 1-4. Claude Code follows the "Claude Code installation" section, which reuses the same component identities and safety rules.

## What you will install

Install these existing components without changing their runtime logic:

- the global `shark-game-assets` Skill;
- the `asset-center-personal-assets` Codex Plugin from the `sharky-3d-assets` marketplace;
- the `asset-center-character-workflow` Codex Plugin from the `sharky-3d-assets` marketplace.

Tell the user that these are three components installed through one guided flow. Request normal command approval when the environment requires it.

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
- Plugin: `asset-center-character-workflow` from marketplace `sharky-3d-assets`

If an identity exists but points to a different source, stop and report the conflict. Do not replace it automatically. In particular, if `asset-center-character-workflow` is already installed from the retired `asset-center-local` marketplace, report that a manual migration to `sharky-3d-assets` is available and leave the existing installation unchanged.

## 3. Install only missing components

If the global Skill is missing, run:

```bash
npx skills add https://github.com/Alterverse-tech/sharky-3d-assets --skill shark-game-assets -g -y
```

If the marketplace is missing, run:

```bash
codex plugin marketplace add Alterverse-tech/sharky-3d-assets --ref main --json
```

If a Plugin is missing, run the matching command only after the marketplace is available:

```bash
codex plugin add asset-center-personal-assets@sharky-3d-assets --json
```

```bash
codex plugin add asset-center-character-workflow@sharky-3d-assets --json
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
3. `asset-center-personal-assets` Plugin;
4. `asset-center-character-workflow` Plugin.

Do not report complete success unless all four are present with the expected identities.

## Claude Code installation

Claude Code installs the same three components with its own plugin CLI. All safety rules above apply unchanged, including exact component identities and no silent repair of conflicts.

### 1. Check prerequisites

Confirm that `node`, `npx`, and `claude` are available. If one is missing, stop and report that exact prerequisite instead of attempting an alternative installer.

### 2. Inspect current state

Run:

```bash
npx skills list -g
claude plugin marketplace list
claude plugin list
```

Use the same component identities: Skill `shark-game-assets`, marketplace `sharky-3d-assets`, plugins `asset-center-personal-assets` and `asset-center-character-workflow` from marketplace `sharky-3d-assets`. The Skill counts as present when it appears either as a global skills-CLI installation (`npx skills list -g`) or as the Claude plugin `shark-game-assets@sharky-3d-assets`; never install both variants.

### 3. Install only missing components

If the marketplace is missing, run:

```bash
claude plugin marketplace add Alterverse-tech/sharky-3d-assets
```

If the Skill is missing in both forms, run this after the marketplace is available:

```bash
claude plugin install shark-game-assets@sharky-3d-assets
```

If a Plugin is missing, run the matching command only after the marketplace is available:

```bash
claude plugin install asset-center-personal-assets@sharky-3d-assets
```

```bash
claude plugin install asset-center-character-workflow@sharky-3d-assets
```

### 4. Verify and report

Run the state checks from step 2 again and report separate results for the Skill, the marketplace, and both Plugins, following the same partial-installation rules as the Codex flow.

## Authentication boundary

The public Shark Game Assets generation workflow does not require a token. Personal Asset Center access — both the personal-assets Plugin and the character-workflow Plugin — signs in through Asset Center OAuth in the browser on first use, or uses an `ASSET_CENTER_SERVICE_TOKEN` already configured locally in the environment that launches Codex. Installation does not require a token value and must not request it in chat.

After successful installation, ask the user to start a new task in the installing agent — a new Codex task or a new Claude Code session — so the newly installed Skill and Plugin tools are discovered.
