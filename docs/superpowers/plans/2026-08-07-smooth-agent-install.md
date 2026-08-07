# Smooth Agent-Driven Installation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user copy one prompt into Codex and have Codex safely install the existing `shark-game-assets` Skill and `asset-center-personal-assets` Plugin.

**Architecture:** A root `INSTALL.md` is the repository-owned, agent-readable installation contract. The README links to that stable public path through one copyable prompt and retains direct CLI commands as a transparent fallback.

**Tech Stack:** Markdown, Skills CLI (`npx skills`), Codex Plugin CLI.

## Global Constraints

- Do not bundle the Skill into the Plugin or rename either component.
- Do not change Skill behavior, MCP tools, Plugin runtime code, or authentication.
- Install only missing components and preserve unrelated skills, marketplaces, plugins, and configuration.
- Do not request or print `ASSET_CENTER_SERVICE_TOKEN` in chat.
- Do not use Browser Use, Computer Use, or a remote executable installer script.
- Keep verification limited to CLI installation-state checks and Markdown validation.

---

### Task 1: Agent-readable installation contract

**Files:**
- Create: `INSTALL.md`

**Interfaces:**
- Consumes: Skills CLI global installation state and Codex Plugin CLI JSON state.
- Produces: A stable public document readable from `https://raw.githubusercontent.com/Alterverse-tech/sharky-3d-assets/main/INSTALL.md`.

- [ ] **Step 1: Confirm the contract does not exist yet**

Run:

```bash
test -f INSTALL.md
```

Expected: non-zero exit status because the file does not exist.

- [ ] **Step 2: Create the installation contract**

Create `INSTALL.md` with these exact operational stages:

```text
1. Explain that one global Skill and one Codex Plugin will be installed.
2. Require node, npx, and codex; stop with a precise missing prerequisite.
3. Run `npx skills list -g`; install only when shark-game-assets is absent.
4. Run `codex plugin marketplace list --json`; add sharky-3d-assets only when absent.
5. Run `codex plugin list --json`; add asset-center-personal-assets only when absent.
6. Re-run the two list commands and report Skill and Plugin results separately.
7. Explain that Asset Center personal-library access needs a locally configured token, without asking for its value.
8. Ask the user to start a new Codex task.
```

Use these installation commands verbatim:

```bash
npx skills add https://github.com/Alterverse-tech/sharky-3d-assets --skill shark-game-assets -g -y
codex plugin marketplace add Alterverse-tech/sharky-3d-assets --ref main --json
codex plugin add asset-center-personal-assets@sharky-3d-assets --json
```

State that failures leave already successful components installed, must be reported as partial installation, and must not trigger deletion or unrelated configuration changes.

- [ ] **Step 3: Validate the contract content**

Run:

```bash
rg -n "npx skills list -g|npx skills add https://github.com/Alterverse-tech/sharky-3d-assets|codex plugin marketplace list --json|codex plugin marketplace add Alterverse-tech/sharky-3d-assets|codex plugin list --json|codex plugin add asset-center-personal-assets@sharky-3d-assets|ASSET_CENTER_SERVICE_TOKEN|new Codex task" INSTALL.md
```

Expected: every state check, install command, authentication boundary, and new-task handoff appears.

### Task 2: One-prompt README entry and fallback commands

**Files:**
- Modify: `README.md` installation section

**Interfaces:**
- Consumes: Root `INSTALL.md` from Task 1.
- Produces: The public copyable prompt and direct manual fallback.

- [ ] **Step 1: Confirm the one-prompt entry is absent**

Run:

```bash
rg -n "raw.githubusercontent.com/Alterverse-tech/sharky-3d-assets/main/INSTALL.md" README.md
```

Expected: non-zero exit status before the README edit.

- [ ] **Step 2: Replace the installation introduction**

Make the primary README installation block exactly:

````markdown
### Install with one prompt in Codex

Paste this into any Codex task:

```text
Read https://raw.githubusercontent.com/Alterverse-tech/sharky-3d-assets/main/INSTALL.md and install Shark Game Assets for me.
```

Codex checks what is already installed, adds only the missing Skill or Plugin components, verifies both results, and asks you to start a new task.

### Manual installation
````

Keep the existing Skill and Plugin commands below `### Manual installation`. Keep the existing token explanation and one-time Plugin recommendation copy.

- [ ] **Step 3: Run lightweight documentation checks**

Run:

```bash
git diff --check
rg -n "Install with one prompt in Codex|Manual installation|npx skills add|codex plugin marketplace add|codex plugin add" README.md
```

Expected: no whitespace errors; the one-prompt path and all three manual commands remain visible.

- [ ] **Step 4: Review the scoped diff**

Run:

```bash
git diff -- INSTALL.md README.md
```

Expected: only the new installation contract and the README installation section changed; no Skill, Plugin, MCP, or authentication implementation files changed.

- [ ] **Step 5: Commit the implementation**

```bash
git add INSTALL.md README.md docs/superpowers/plans/2026-08-07-smooth-agent-install.md
git commit -m "docs: add one-prompt Shark Game Assets install"
```
