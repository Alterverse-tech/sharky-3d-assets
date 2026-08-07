# Verified Preview Link Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a clickable, HTTP-verified `/regeneration.html` link at the first successful preview update and again at final handoff.

**Architecture:** The repository Skill points to a precise reporting contract in its regeneration-preview reference. The reference owns listener/page verification, exact Markdown output, both reporting moments, and unavailable behavior. The active `.agents` copy receives the same narrow text without overwriting its unrelated local differences.

**Tech Stack:** Markdown Skills, Node.js `assert` documentation bench, `lsof`, `curl`.

## Global Constraints

- Report the link only after `lsof`, `validate-regeneration-preview.mjs`, and the exact `/regeneration.html` URL return HTTP `200` for the current loopback port.
- First verified progress update and final user-facing handoff both use `素材预览：[http://127.0.0.1:<port>/regeneration.html](http://127.0.0.1:<port>/regeneration.html)`.
- Do not use an HTTP check as gameplay, visual, or character-orientation acceptance.
- Failed verification reports preview unavailability and never invents a link.

---

### Task 1: Encode and verify the reporting contract

**Files:**
- Create: `tests/preview-link-delivery-bench.mjs`
- Modify: `shark-game-assets/SKILL.md:71-85`
- Modify: `shark-game-assets/references/regeneration-preview.md:158-185`
- Modify: `/Users/cppeng/.agents/skills/shark-game-assets/SKILL.md:71-85`
- Modify: `/Users/cppeng/.agents/skills/shark-game-assets/references/regeneration-preview.md:158-185`

**Interfaces:**
- Consumes: the actual current-project loopback URL and the HTTP status from `curl`.
- Produces: exactly one Markdown `素材预览` link in the first verified progress update and one in final handoff; otherwise a clear unavailable message.

- [ ] **Step 1: Write the failing contract bench**

  Create `tests/preview-link-delivery-bench.mjs` with:

  ```js
  import assert from "node:assert/strict";
  import { readFileSync } from "node:fs";
  import path from "node:path";
  import { fileURLToPath } from "node:url";

  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const skill = readFileSync(path.join(repo, "shark-game-assets", "SKILL.md"), "utf8");
  const reference = readFileSync(path.join(repo, "shark-game-assets", "references", "regeneration-preview.md"), "utf8");

  assert.match(skill, /verified preview link delivery/i);
  assert.match(reference, /Only an HTTP `200` response permits link delivery/);
  assert.match(reference, /素材预览：\[http:\/\/127\.0\.0\.1:<port>\/regeneration\.html\]\(http:\/\/127\.0\.0\.1:<port>\/regeneration\.html\)/);
  assert.match(reference, /first progress update after that verification/i);
  assert.match(reference, /final user-facing handoff/i);
  assert.match(reference, /preview is temporarily unavailable/i);

  process.stdout.write("preview link delivery bench passed\\n");
  ```

- [ ] **Step 2: Run the bench and verify it fails before implementation**

  Run: `node tests/preview-link-delivery-bench.mjs`

  Expected: `AssertionError`, because neither the source Skill nor its reference defines the verified-link delivery contract.

- [ ] **Step 3: Add the minimal delivery rule to both copies**

  In each `SKILL.md`, add a `Verified preview link delivery` pointer after the default preview checklist. It must direct agents to the reference before reporting a preview URL.

  In each `references/regeneration-preview.md`, add a section after localhost checks with these exact requirements:

  ```md
  Only an HTTP `200` response permits link delivery.

  素材预览：[http://127.0.0.1:<port>/regeneration.html](http://127.0.0.1:<port>/regeneration.html)
  ```

  It must require the first progress update after verification and the final user-facing handoff to include the link, forbid bare paths/ports and invented links, and say `preview is temporarily unavailable` when verification fails. Keep orientation and gameplay acceptance separate.

- [ ] **Step 4: Run focused source and installed-copy checks**

  Run:

  ```bash
  node tests/preview-link-delivery-bench.mjs
  rg -n -F "Verified preview link delivery" /Users/cppeng/.agents/skills/shark-game-assets/SKILL.md
  rg -n -F "Only an HTTP \`200\` response permits link delivery" /Users/cppeng/.agents/skills/shark-game-assets/references/regeneration-preview.md
  ```

  Expected: the bench prints `preview link delivery bench passed` and both installed-copy searches return the new rule.

- [ ] **Step 5: Review and commit only repository files**

  Run:

  ```bash
  git diff --check
  git diff -- shark-game-assets/SKILL.md shark-game-assets/references/regeneration-preview.md tests/preview-link-delivery-bench.mjs
  git add shark-game-assets/SKILL.md shark-game-assets/references/regeneration-preview.md tests/preview-link-delivery-bench.mjs
  git commit -m "docs: require verified preview links"
  ```

  Expected: one focused repository commit; the active installed copy is confirmed updated but remains outside this repository's Git history.
