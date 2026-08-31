# Install Sharky 3D Assets

This document is an installation contract for coding agents. The marketplace publishes only the `cpt-floor` Plugin.

## Safety rules

- Inspect current state first and install only missing components.
- Preserve unrelated skills, marketplaces, plugins, and configuration.
- Do not remove or overwrite an existing installation automatically.
- Treat network, permission, and CLI failures as failures.

## Codex

Confirm that `codex` is available, then inspect current state:

```bash
codex plugin marketplace list --json
codex plugin list --json
```

Install only the components the user requested and that are currently missing:

```bash
codex plugin marketplace add Alterverse-tech/sharky-3d-assets --ref main --json
codex plugin add cpt-floor@sharky-3d-assets --json
```

Run the state checks again and report the marketplace and `cpt-floor` Plugin separately. Do not report complete success after a partial or failed command.

## Claude Code

Confirm that `claude` is available, then inspect current state:

```bash
claude plugin marketplace list
claude plugin list
```

Install only missing requested components:

```bash
claude plugin marketplace add Alterverse-tech/sharky-3d-assets
claude plugin install cpt-floor@sharky-3d-assets
```

Run the state checks again and report each component separately. After a successful installation, ask the user to start a new task or Claude Code session so the Plugin is discovered.
