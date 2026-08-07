---
name: game-final-playtest-fix-acceptance
description: Run the mandatory post-generation QA, repair, retest, and acceptance workflow for a browser game. Use after Codex builds, regenerates, or substantially revises a playable Three.js, WebGL, React Three Fiber, or similar game and must independently playtest it, record evidence, fix defects, and issue a final acceptance report.
---

# Game Final Playtest, Fix, And Acceptance

Complete this gate after the game and its assets are integrated and a runnable build exists. Do not replace observable playtesting with implementation assumptions. Keep the initial findings, repairs, retest evidence, and final acceptance decision in one report.

## 1. Establish The Baseline

1. Locate the project root, original script or requirements, game entry, run/build/test commands, asset manifest, player controller, world/collision system, puzzle state, save system, and ending definitions. Read applicable `AGENTS.md` files before using tools or editing.
2. Derive a compact oracle from the original script or requirements: areas, progression gates, puzzles, required clues/items, characters, physical actions, fail states, main ending, alternate endings, controls, visual tone, and explicit timing rules. Treat this oracle—not the current code—as expected behavior.
3. Build the game and run existing tests without rewriting files. Start or reuse the documented server, verify the intended URL returns HTTP 200, and identify missing assets or console/runtime errors.
4. Run `validate-game-asset-integration.mjs` against the confirmed sourcing plan and manifest. When any confirmed model slot is not `primitive_fallback`, the final retest must also run it with `--require-runtime` against `artifacts/playtest/asset-runtime-report.json`; bind that report to the playable game scene URL, current entry-file hash, and hashed screenshot/video/frame evidence. A confirmed GLB that is missing, invisible, replaced by a primitive, hash/path-mismatched, or paired with the wrong/unplayed confirmed action is a blocking failure. Asset-preview evidence cannot satisfy this game-scene gate.
5. Ask for Browser/Computer Use permission when active instructions require it. If authorization is denied or browser control is unavailable, continue with source, build, unit, asset, and rendered checks; never describe those as browser playtesting. A user screenshot or independent renderer may supply the GLB runtime evidence; source/HTTP evidence may not.
6. Create or reuse `artifacts/playtest/QA_REPORT.md`. Store evidence images in `artifacts/playtest/` with ordered, descriptive names such as `01-baseline-title.png` and `12-fixed-player-facing.png`.

## 2. Run An Independent Senior Playtest

When subagents are available, spawn one senior game playtest/QA agent. Give it only raw inputs:

- project root and runnable URL;
- original script or requirements;
- controls and expected test scope;
- report row schema and evidence rules.

Do not give it suspected bugs, intended fixes, production constants, or prior conclusions. Instruct it not to edit files. Require it to return findings and screenshots or clearly state why browser evidence was unavailable. If subagents are unavailable, perform the pass locally and record `Independent QA agent unavailable` in coverage.

Use a prompt equivalent to:

```text
Act as a senior game playtester. Independently compare the supplied game with its original script/requirements. Complete the main progression and one ending when browser access is available. Audit other endings with targeted states and source. Check game logic, physical actions, controls, player/model orientation, camera, lighting, collisions, interaction occlusion, puzzle recovery, saves, assets, performance, and runtime errors. Do not edit the game. Return reproducible findings using the requested schema and distinguish browser evidence from source or unit evidence.
```

Default coverage:

- complete the main path and one ending in one continuous run when actual playtesting is available;
- cover remaining finite endings/fail states with targeted state setup plus source/rule inspection;
- verify start/new game, save/continue, modal movement freeze, shortcuts, at least one error-and-recovery path per puzzle family, and final restart;
- inspect script fidelity, progression continuity, doors/gates/props performing the action described, plausible physics, locked-path bypasses, camera clipping, interaction through walls, lighting/readability, model grounding/scale/animation, asset failure fallbacks, load timing, bundle size, responsiveness, accessibility, and browser logs.

## 3. Write The Initial Issue Table

Preserve the baseline even after repairs. Use severities:

- `P0`: blocks starting, navigating, progressing, saving, or completing the chosen ending;
- `P1`: breaks a core mechanic, story contract, critical physical action, or common compatibility path;
- `P2`: important gameplay, physics, recovery, readability, consistency, or performance defect;
- `P3`: non-blocking polish, documentation, optimization, or minor accessibility defect.

Use this exact issue schema:

| 编号 | 模块/剧本点 | 预期 | 实际与复现 | 严重度 | 证据类型 | 截图 |
|---|---|---|---|---|---|---|

Use only these evidence types: `BROWSER_PLAYTEST`, `USER_PLAYTEST`, `RENDERED`, `UNIT_TEST`, `SOURCE_AUDIT`, `UNVERIFIED`. A finding may list more than one. Link screenshots with absolute local paths. Never mark a source inference as an observed visual result.

## 4. Repair In Priority Order

1. Reproduce each P0–P2 against the independent oracle before changing code. Fix P0, then P1, then P2. Fix P3 when safe and inexpensive; otherwise retain it as a named residual.
2. Preserve unrelated user changes. Keep visual GLBs separate from stable gameplay hitboxes. Make doors, gates, shelves, racks, levers, locks, liquids, and other mechanisms perform the physical action described before collision or progression changes allow passage.
3. Treat a confirmed GLB rendered as a primitive or omitted from the live scene as P0. Preserve the fallback for load failure, but do not accept it as satisfying the confirmed slot; only sourcing-plan slots explicitly confirmed as `primitive_fallback` may pass that way.
4. Add independent regression coverage for deterministic rules such as puzzle prerequisites, reset behavior, timers, save migrations, direction vectors, and simultaneous-input windows.
5. Do not use the same unverified production constant, helper, or branch as both implementation input and test oracle. Derive expected values from the script, trusted manifest metadata, independent geometry/render inspection, or explicit test fixtures.
6. For direction-sensitive models, independently audit the native visual forward axis. Verify all cardinal and diagonal movement directions mathematically against actual velocity, then inspect at least one rendered movement sequence. Pure mathematical self-consistency cannot prove face direction.
7. Permit a temporary same-origin state-seed page only for late-game targeted retests. Name it clearly, use it only on the local test origin, and delete it before handoff. It never replaces the continuous main-path run.

## 5. Retest And Iterate

Let the main agent run the repair retest. Repeat `repair -> build/tests -> targeted regression -> acceptance audit` at most twice.

For each round:

1. Run existing and new unit/integration tests, lint/static checks, and the production build.
2. Verify the documented server and URL, HTTP status, asset requests, and console errors.
3. Re-run every repaired issue using the same externally observable reproduction where possible.
4. Re-run `validate-game-asset-integration.mjs --require-runtime` whenever the confirmed plan contains GLB slots, and include its exact result plus the observed runtime report in the QA evidence.
5. Re-run the continuous main path and chosen ending after the final repair round when browser playtesting is available.
6. Capture fixed-state evidence separately from baseline evidence.
7. Check that temporary seeds/debug overlays are removed and that production gameplay does not depend on test-only state.

After the second repair round, do not continue silently. If any P0–P2 remains, record it and return `NOT_ACCEPTED`.

## 6. Update The Final Report

Append a repair table after the original issue table:

| 编号 | 修复状态 | 实现摘要 | 验证方式 | 修复后证据 |
|---|---|---|---|---|

Include:

- overall conclusion and exact acceptance status;
- original test coverage and post-fix coverage;
- preserved baseline issue table;
- issue-by-issue repair results;
- commands and results for tests, lint, build, HTTP, assets, and console logs;
- P3 residuals and all `UNVERIFIED` behavior;
- baseline and fixed screenshots;
- continuous-run coverage versus targeted/source-only coverage;
- confirmation that temporary QA fixtures were removed.

Use exactly one final status:

- `ACCEPTED_PLAYTESTED`: actual browser/user playtesting completed the main path and one ending, and no P0–P2 remains.
- `ACCEPTED_STATIC_ONLY`: browser playtesting was not authorized or unavailable, but build, tests, assets, and source/rule audits pass with no known P0–P2. This status is unavailable when a playable game has confirmed GLB slots but lacks a passing `--require-runtime` asset report from browser, user, or rendered evidence. State prominently that lighting, feel, orientation, animation, and other visual behavior remain unverified unless separately rendered.
- `NOT_ACCEPTED`: the build or main path fails, the chosen ending cannot complete, or any P0–P2 remains after two rounds.

P3 issues may remain only when explicitly listed as non-blocking. Do not delete, downgrade, or hide a finding merely to reach acceptance.

## 7. Handoff

Lead with the acceptance status. Provide the runnable URL or command, HTTP result, test/build summary, report path, key screenshot paths, and residual risks. Keep the game server running when the user requested a live local deployment. Never claim a full playthrough, visual acceptance, or all-ending coverage beyond the recorded evidence.
