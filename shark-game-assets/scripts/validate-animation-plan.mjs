#!/usr/bin/env node

// Validates the frozen action requirements plan (animation-plan.json) against
// the bundled Tripo preset catalog and the cost budget. Run it after the user
// confirms the action requirements list and before the first generate/animate
// call that would spend Tripo retarget credits. A failed validation blocks
// action generation.
//
// Budget overruns do NOT fail: Tripo actions beyond an asset's budget degrade
// in place to the procedural tier (confirmed order decides which stay), the
// plan file is rewritten with explicit `degraded` markers, and the degradations
// are reported as warnings. Hard failures remain: missing user confirmation,
// presets outside the catalog, malformed entries, missing scene descriptions.

import { readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const cwd = path.resolve(option("cwd") || process.cwd());
const planFile = option("plan") || "animation-plan.json";
const errors = [];
const degraded = [];

function option(name) {
  const exact = `--${name}`;
  const index = argv.indexOf(exact);
  if (index >= 0) return argv[index + 1];
  const prefix = `${exact}=`;
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

const catalogFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "preset-catalog.json");
let catalog = null;
try {
  catalog = JSON.parse(readFileSync(catalogFile, "utf8"));
} catch (error) {
  errors.push(`preset-catalog.json: ${error.message}`);
}

let plan = null;
try {
  plan = JSON.parse(await readFile(path.join(cwd, planFile), "utf8"));
} catch (error) {
  errors.push(`${planFile}: ${error.message}`);
}

let summary;
if (plan && catalog) {
  if (plan.schema !== "shark-game-assets-animation-plan") errors.push(`${planFile}: schema must be "shark-game-assets-animation-plan"`);
  if (typeof plan.runId !== "string" || !plan.runId.trim()) errors.push(`${planFile}: missing runId`);

  const confirmation = plan.confirmation;
  if (!confirmation || confirmation.confirmed !== true || confirmation.confirmedBy !== "user" || typeof confirmation.confirmedAt !== "string" || !confirmation.confirmedAt.trim()) {
    errors.push(
      `${planFile}: missing explicit user confirmation (confirmation.confirmed=true, confirmedBy="user", confirmedAt). Do not generate actions or modify game code before the user confirms the action requirements list.`
    );
  }

  const defaultBudget = Number.isInteger(catalog.budget?.tripoPresetsPerKeyAsset) ? catalog.budget.tripoPresetsPerKeyAsset : 3;
  const budget = Number.isInteger(plan.budget?.tripoPresetsPerKeyAsset) && plan.budget.tripoPresetsPerKeyAsset >= 0
    ? plan.budget.tripoPresetsPerKeyAsset
    : defaultBudget;

  if (!Array.isArray(plan.assets) || !plan.assets.length) errors.push(`${planFile}: assets must be non-empty`);

  const ids = new Set();
  let tripoTotal = 0;
  for (const asset of plan.assets || []) {
    const id = typeof asset?.id === "string" ? asset.id : "";
    const owner = `${planFile}: ${id || "<asset>"}`;
    if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) errors.push(`${planFile}: invalid asset id ${id || "<empty>"}`);
    if (ids.has(id)) errors.push(`${planFile}: duplicate asset id ${id}`);
    ids.add(id);

    if (asset.tier !== "key" && asset.tier !== "secondary") errors.push(`${owner}: tier must be "key" or "secondary"`);

    const rigModel = catalog.rigModels?.[asset.rigModel];
    if (!rigModel) errors.push(`${owner}: rigModel must be one of ${Object.keys(catalog.rigModels || {}).join(", ")}`);
    const presets = rigModel?.rigTypes?.[asset.rigType];
    if (rigModel && !Array.isArray(presets)) errors.push(`${owner}: rigType must be one of ${Object.keys(rigModel.rigTypes || {}).join(", ")}`);

    if (!Array.isArray(asset.actions)) {
      errors.push(`${owner}: actions must be an array`);
      continue;
    }

    // Budget overflow is not a hard failure: confirmed order is priority order,
    // so Tripo actions beyond the asset's budget (key: `budget`, secondary: 0)
    // degrade in place to the procedural tier with an explicit marker. This is
    // the L1->L2 step of the action degradation chain, applied at plan level.
    const assetBudget = asset.tier === "key" ? budget : 0;
    let tripoSeen = 0;
    for (const action of asset.actions) {
      if (action?.source !== "tripo") continue;
      tripoSeen += 1;
      if (tripoSeen <= assetBudget) continue;
      const preset = typeof action.preset === "string" ? action.preset : undefined;
      action.source = "procedural";
      action.degraded = {
        from: "tripo",
        ...(preset ? { preset } : {}),
        reason: `tripo budget is ${assetBudget} for ${asset.tier} assets`
      };
      delete action.preset;
      degraded.push(`${owner}.${action.name}: over the Tripo budget (${assetBudget} for ${asset.tier}); degraded to procedural${preset ? ` (was ${preset})` : ""}`);
    }

    const names = new Set();
    let tripoCount = 0;
    for (const action of asset.actions) {
      const name = typeof action?.name === "string" ? action.name : "";
      const label = `${owner}.${name || "<action>"}`;
      if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) errors.push(`${owner}: action name must be lowercase (letters, digits, underscores), got ${name || "<empty>"}`);
      if (names.has(name)) errors.push(`${label}: duplicate action name`);
      names.add(name);

      if (typeof action?.scene !== "string" || !action.scene.trim()) errors.push(`${label}: missing scene (触发动作场景描述)`);

      if (action?.source === "tripo") {
        tripoCount += 1;
        if (typeof action.preset !== "string" || !action.preset.trim()) {
          errors.push(`${label}: tripo action requires a preset id from preset-catalog.json`);
        } else if (Array.isArray(presets) && !presets.includes(action.preset)) {
          const hint = presets.length ? "" : " (this rig type has no Tripo presets; use procedural instead)";
          errors.push(`${label}: preset ${action.preset} is not in the catalog for ${asset.rigModel}/${asset.rigType}${hint}`);
        }
      } else if (action?.source === "procedural") {
        if (action.preset) errors.push(`${label}: procedural actions must not carry a Tripo preset`);
      } else {
        errors.push(`${label}: source must be "tripo" or "procedural"`);
      }
    }

    tripoTotal += tripoCount;
  }

  summary = { assets: (plan.assets || []).length, tripoPresets: tripoTotal, budgetPerKeyAsset: budget };
}

// Persist the degraded plan so downstream derivation (generate params,
// regeneration slots, manifest actions) reads the enforced version, never the
// over-budget original. Degradations are reported, not silent.
if (!errors.length && degraded.length && plan) {
  await writeFile(path.join(cwd, planFile), `${JSON.stringify(plan, null, 2)}\n`);
}

const result = {
  status: errors.length ? "failed" : "ok",
  cwd,
  plan: planFile,
  ...(summary ? { summary } : {}),
  ...(degraded.length ? { warnings: degraded } : {}),
  errors
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (errors.length) process.exitCode = 1;
