# Asset Confirmation Freshness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent historical asset plans from satisfying a current game's confirmation gate, while allowing intent-related history to prefill a newly rendered board.

**Architecture:** Persist a compact intent snapshot with new sourcing proposals and plans. Treat disk confirmation fields as audit metadata only; the skills require a live Widget confirmation in the active asset task and conservatively classify historical intent before using it as prefill context.

**Tech Stack:** Node.js ESM, MCP Apps skill documentation, existing bench scripts.

## Global Constraints

- Keep the change small; do not add thread identity, authentication, or browser automation.
- Historical plans may prefill only when intent is related; they never authorize execution.
- Unrelated or uncertain history is ignored.
- Existing plan files remain readable.

---

### Task 1: Separate historical intent from live confirmation

**Files:**
- Modify: `plugins/asset-center-personal-assets/scripts/sourcing-contract.mjs`
- Modify: `shark-game-assets/scripts/validate-asset-sourcing-plan.mjs`
- Modify: `plugins/asset-center-personal-assets/skills/asset-center-personal-assets/SKILL.md`
- Modify: `shark-game-assets/SKILL.md`
- Modify: `README.md`
- Test: `tests/asset-sourcing-plan-bench.mjs`
- Test: `tests/asset-sourcing-docs-bench.mjs`

**Interfaces:**
- Produces: `proposal.intentSnapshot` and `plan.intentSnapshot`, containing `gameSummary` plus normalized model/action slots.
- Produces: validator result field `currentTaskAuthorization: "not_evaluated"`.
- Skill contract: `active_same_task`, `related_history`, `unrelated_history`, and `uncertain` routing before the board.

- [ ] **Step 1: Add failing intent and authorization assertions**

Add assertions that new proposals/plans retain the normalized game intent, that the validator never claims current authorization, and that both skills contain the disk-confirmation prohibition and four intent states.

- [ ] **Step 2: Run the two narrow benches and confirm failure**

Run:

```bash
node tests/asset-sourcing-plan-bench.mjs
node tests/asset-sourcing-docs-bench.mjs
```

Expected: at least one new assertion fails before implementation.

- [ ] **Step 3: Implement the minimal contract and documentation changes**

Build `intentSnapshot` from the already available `gameSummary`, slot identity, asset kind, role, and semantic action names. Preserve it when the Widget freezes the plan. Change validator output and wording so success means structural validity only. Add the conservative intent-routing rules to both skills and the root README.

- [ ] **Step 4: Run the same narrow benches**

Run:

```bash
node tests/asset-sourcing-plan-bench.mjs
node tests/asset-sourcing-docs-bench.mjs
```

Expected: both commands print their existing `passed` messages.

- [ ] **Step 5: Check and commit the focused diff**

Run `git diff --check`, inspect `git status --short`, then commit only the plan, contract, validator, skills, README, and two bench files.
