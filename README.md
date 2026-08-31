# Sharky 3D Assets

This marketplace currently publishes one plugin: `cpt-floor`.

## Installation

### Codex

```bash
codex plugin marketplace add Alterverse-tech/sharky-3d-assets --ref main
codex plugin add cpt-floor@sharky-3d-assets
```

### Claude Code

```bash
claude plugin marketplace add Alterverse-tech/sharky-3d-assets
claude plugin install cpt-floor@sharky-3d-assets
```

## Central Park Tower floor authoring

After installing the plugin, use the same prompt in Codex or Claude Code:

```text
$cpt-floor 给30楼建一个羽毛球馆
```

The Skill downloads the current author kit, prepares an isolated workspace, validates the floor, and returns a verified hot-reload preview. It claims or publishes the floor only when you explicitly ask.
