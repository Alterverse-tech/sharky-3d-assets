# Asset Preview Links Open in Codex Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GLB preview links in the Asset Sourcing Board use Codex's native browser and context-menu behavior.

**Architecture:** `AssetSourcingBoard` will leave valid preview URLs as ordinary, new-tab anchors. The bridge will no longer intercept those anchors and request an explicit host link-opening decision. The existing package bench will assert the native-anchor contract in source and generated bundle output.

**Tech Stack:** React/TypeScript, esbuild, Node.js `assert` package bench.

## Global Constraints

- Only `http:` and `https:` preview URLs remain clickable through `safePreviewUrl`.
- Do not change asset selection, catalog lookup, import, or generation behavior.
- Preserve `target="_blank"`, existing link labels, and native Codex ownership of left-click and right-click behavior.

---

### Task 1: Restore native preview anchors

**Files:**
- Modify: `plugins/asset-center-personal-assets/web/src/AssetSourcingBoard.tsx:3-12,345-358`
- Modify: `plugins/asset-center-personal-assets/web/src/bridge.ts:12-21,101-119`
- Modify: `plugins/asset-center-personal-assets/web/dist/asset-sourcing-board.js` (generated)
- Modify: `tests/plugin-package-bench.mjs:20-41`

**Interfaces:**
- Consumes: `ChoiceRow.previewUrl`, which is either an HTTP/HTTPS URL returned by `safePreviewUrl` or `undefined`.
- Produces: A standard `<a href={row.previewUrl} target="_blank" rel="noreferrer">` without a click interception.

- [ ] **Step 1: Write the failing source and bundle contract test**

  In `tests/plugin-package-bench.mjs`, replace the link-opening assertions with:

  ```js
  assert.match(widget, /href=\{row\.previewUrl\}\s*target="_blank"\s*rel="noreferrer"/);
  assert.doesNotMatch(widget, /openHostLink|event\.preventDefault\(\)/);
  assert.doesNotMatch(bridge, /openHostLink|ui\/open-link|openExternal/);
  assert.doesNotMatch(bundle, /ui\/open-link|openExternal/);
  ```

- [ ] **Step 2: Run the bench and verify it fails before implementation**

  Run: `node tests/plugin-package-bench.mjs`

  Expected: the source still contains `openHostLink` and the bundle still contains `ui/open-link`.

- [ ] **Step 3: Remove the custom opening path**

  In `AssetSourcingBoard.tsx`, remove the `openHostLink` import and the `onClick` handler so the preview markup is:

  ```tsx
  <a href={row.previewUrl} target="_blank" rel="noreferrer">
    <FormattedText value={row.candidate} /><span aria-hidden="true">↗</span>
  </a>
  ```

  In `bridge.ts`, remove `window.openai.openExternal` from the declared host bridge and delete `openHostLink`. Do not change `safePreviewUrl`, selection controls, or the rest of the bridge.

- [ ] **Step 4: Rebuild the widget and run the focused bench**

  Run:

  ```bash
  node plugins/asset-center-personal-assets/web/build.mjs
  node tests/plugin-package-bench.mjs
  ```

  Expected: esbuild completes and the bench prints `plugin package bench passed`.

- [ ] **Step 5: Inspect the focused diff and commit**

  Run:

  ```bash
  git diff --check
  git diff -- plugins/asset-center-personal-assets/web/src/AssetSourcingBoard.tsx plugins/asset-center-personal-assets/web/src/bridge.ts plugins/asset-center-personal-assets/web/dist/asset-sourcing-board.js tests/plugin-package-bench.mjs
  git add plugins/asset-center-personal-assets/web/src/AssetSourcingBoard.tsx plugins/asset-center-personal-assets/web/src/bridge.ts plugins/asset-center-personal-assets/web/dist/asset-sourcing-board.js tests/plugin-package-bench.mjs
  git commit -m "fix: open GLB previews in Codex browser"
  ```

  Expected: one focused feature commit contains only the preview-link implementation, rebuilt bundle, and matching bench assertion.
