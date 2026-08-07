# README Installation Hero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a centered promotional hero with three independently clickable visual buttons and a copyable one-prompt installer to the GitHub README.

**Architecture:** GitHub-compatible HTML provides layout and one HTTPS `<a>` destination per button. Three repository-owned SVG files provide deterministic button styling, while the installation prompt remains a fenced Markdown block with GitHub's native copy control.

**Tech Stack:** GitHub Flavored Markdown, inline README HTML, SVG 1.1, HTTPS links.

## Global Constraints

- Keep Skill, Plugin, MCP, installer, authentication, and asset-generation logic unchanged.
- Do not add JavaScript, Browser Use, Computer Use, or custom URI schemes.
- Use only the three verified HTTPS destinations from the approved design.
- Preserve the existing product screenshot and all README content after the new hero.
- Use `248 × 64` SVG view boxes, `10px` radii, accessible titles, and high-contrast labels.

---

### Task 1: Create the three button assets

**Files:**
- Create: `docs/img/button-open-asset-center.svg`
- Create: `docs/img/button-use-in-codex.svg`
- Create: `docs/img/button-use-in-claude.svg`

**Interfaces:**
- Consumes: The approved labels, palette, and geometry.
- Produces: Three local SVG image paths referenced by README `<img>` elements.

- [ ] **Step 1: Confirm the assets are absent**

```bash
test -e docs/img/button-open-asset-center.svg -o -e docs/img/button-use-in-codex.svg -o -e docs/img/button-use-in-claude.svg
```

Expected: non-zero exit status.

- [ ] **Step 2: Create all button SVGs**

Use this shared geometry and typography in each file:

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="248" height="64" viewBox="0 0 248 64" role="img" aria-labelledby="title">
  <title id="title">Button label</title>
  <rect x="0.5" y="0.5" width="247" height="63" rx="10"/>
  <text y="40" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="20" font-weight="650">Button label</text>
</svg>
```

Apply these exact variants:

- Asset Center: `#111111` fill, white text, label `Open Asset Center`, right arrow.
- Codex: white fill, `#DDE0E5` border, `#171717` mark and text, label `Use in Codex`.
- Claude: `#F2F0EE` fill, coral `#E8916C` signal mark, `#2B1B10` text, label `Use in Claude`.

- [ ] **Step 3: Validate the SVG files**

```bash
python3 -c "import xml.etree.ElementTree as E; [E.parse(p) for p in ['docs/img/button-open-asset-center.svg','docs/img/button-use-in-codex.svg','docs/img/button-use-in-claude.svg']]"
```

Expected: exit status 0 with no output.

### Task 2: Replace the README top block

**Files:**
- Modify: `README.md:1-7`

**Interfaces:**
- Consumes: The three SVG paths from Task 1 and the existing root `INSTALL.md`.
- Produces: A GitHub-renderable hero with three independent HTTPS calls to action.

- [ ] **Step 1: Confirm the hero is absent**

```bash
rg -n "Your AI 3D Game Asset Assistant|button-use-in-claude.svg" README.md
```

Expected: non-zero exit status.

- [ ] **Step 2: Replace the title and empty documentation heading**

Insert this exact structure before the existing product screenshot:

```html
<div align="center">
  <h1>Your AI 3D Game Asset Assistant</h1>
  <p>Generate, animate, reuse, and integrate production-ready GLB assets without leaving your coding workflow.</p>
  <p>
    <a href="https://studio.13-216-49-19.sslip.io/asset-center/"><img src="docs/img/button-open-asset-center.svg" alt="Open Asset Center" width="238"></a>
    <a href="https://github.com/Alterverse-tech/sharky-3d-assets/blob/main/INSTALL.md"><img src="docs/img/button-use-in-codex.svg" alt="Use in Codex" width="238"></a>
    <a href="https://www.skills.sh/alterverse-tech/sharky-3d-assets/shark-game-assets"><img src="docs/img/button-use-in-claude.svg" alt="Use in Claude" width="238"></a>
  </p>
  <h3>Install with one prompt in Codex</h3>
  <p>Paste the prompt below into any task in the Codex desktop app.</p>
</div>
```

Immediately follow it with:

```text
Read https://raw.githubusercontent.com/Alterverse-tech/sharky-3d-assets/main/INSTALL.md and install Shark Game Assets for me.
```

Keep the existing product screenshot directly after the prompt.

- [ ] **Step 3: Check README links and labels**

```bash
rg -n "https://studio.13-216-49-19.sslip.io/asset-center/|https://github.com/Alterverse-tech/sharky-3d-assets/blob/main/INSTALL.md|https://www.skills.sh/alterverse-tech/sharky-3d-assets/shark-game-assets|alt=\"Open Asset Center\"|alt=\"Use in Codex\"|alt=\"Use in Claude\"" README.md
```

Expected: all three destinations and all three alt labels appear.

### Task 3: Verify and commit the scoped change

**Files:**
- Verify: `README.md`
- Verify: `docs/img/button-open-asset-center.svg`
- Verify: `docs/img/button-use-in-codex.svg`
- Verify: `docs/img/button-use-in-claude.svg`
- Include: `docs/superpowers/plans/2026-08-07-readme-install-hero.md`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: A clean, committed README presentation change.

- [ ] **Step 1: Run formatting and scope checks**

```bash
git diff --check
git status --short
git diff --name-status origin/main...HEAD
```

Expected: no whitespace errors and no runtime implementation files.

- [ ] **Step 2: Recheck the three HTTPS targets**

```bash
curl -sS -L -o /dev/null -w '%{http_code}\n' https://studio.13-216-49-19.sslip.io/asset-center/
curl -sS -L -o /dev/null -w '%{http_code}\n' https://github.com/Alterverse-tech/sharky-3d-assets/blob/main/INSTALL.md
curl -sS -L -o /dev/null -w '%{http_code}\n' https://www.skills.sh/alterverse-tech/sharky-3d-assets/shark-game-assets
```

Expected: `200` for each URL.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/img/button-open-asset-center.svg docs/img/button-use-in-codex.svg docs/img/button-use-in-claude.svg docs/superpowers/plans/2026-08-07-readme-install-hero.md
git commit -m "docs: add clickable README installation hero"
```
