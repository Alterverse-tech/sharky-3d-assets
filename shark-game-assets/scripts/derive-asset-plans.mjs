#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { validateAssetSourcingPlan } from "./validate-asset-sourcing-plan.mjs";

export function deriveAssetPlans(plan) {
  const regeneration = {
    version: 1,
    runId: plan.runId,
    startedAt: plan.confirmation.confirmedAt,
    items: [],
  };
  const animation = {
    version: 1,
    schema: "shark-game-assets-animation-plan",
    runId: plan.runId,
    createdAt: plan.confirmation.confirmedAt,
    budget: { tripoPresetsPerKeyAsset: 3 },
    confirmation: { ...plan.confirmation },
    assets: [],
  };
  const generation = {
    version: 1,
    schema: "shark-asset-generation-request",
    runId: plan.runId,
    confirmedAt: plan.confirmation.confirmedAt,
    assets: [],
    actionJobs: [],
  };

  for (const slot of plan.slots) {
    const modelRuntimeUrl = slot.model.resolved?.modelPath ? runtimeUrl(slot.model.resolved.modelPath) : "";
    const modelSource = slot.model.source === "reuse_asset_center" ? "asset_center" : slot.model.source === "reuse_project" ? "project" : "generated";
    const glbActions = [];
    const animationActions = [];

    if (slot.model.source === "generate_new") {
      generation.assets.push({
        id: slot.id,
        name: slot.name,
        role: slot.role,
        assetKind: slot.assetKind,
        generator: slot.model.generator ?? "tripo",
      });
    }

    for (const action of slot.actions) {
      if (action.source === "reuse_linked_action" || action.source === "reuse_compatible_action") {
        const actionRuntimeUrl = runtimeUrl(action.resolved.modelPath);
        glbActions.push({ name: action.name, source: action.resolved.origin, runtimeUrl: actionRuntimeUrl });
        animationActions.push({ name: action.name, scene: action.scene, source: action.resolved.origin, runtimeUrl: actionRuntimeUrl, cost: 0 });
      } else if (action.source === "generate_action") {
        glbActions.push({ name: action.name, source: "tripo" });
        animationActions.push({ name: action.name, scene: action.scene, source: "tripo", preset: action.preset });
        generation.actionJobs.push({
          assetId: slot.id,
          action: action.name,
          generator: action.generator,
          preset: action.preset,
          generationRoute: action.generationRoute,
          base: slot.model.source === "generate_new"
            ? { kind: "generated_asset", assetId: slot.id }
            : { kind: "local_glb", modelPath: slot.model.resolved.modelPath },
        });
      } else {
        animationActions.push({ name: action.name, scene: action.scene, source: "procedural" });
      }
    }

    regeneration.items.push({
      id: slot.id,
      name: slot.name,
      role: slot.role,
      source: modelSource,
      ...(modelRuntimeUrl ? { runtimeUrl: modelRuntimeUrl } : {}),
      actions: glbActions,
    });
    animation.assets.push({
      id: slot.id,
      name: slot.name,
      tier: slot.tier === "secondary" ? "secondary" : "key",
      tierReason: `Source selected in ${plan.runId}`,
      rigModel: slot.rigModel ?? "v1.0-20240301",
      rigType: slot.rigType ?? "biped",
      actions: animationActions,
    });
  }

  return { regeneration, animation, generation };
}

function runtimeUrl(modelPath) {
  if (typeof modelPath !== "string" || !modelPath.startsWith("public/")) throw new Error(`Cannot derive runtime URL from ${String(modelPath)}`);
  const value = `/${modelPath.slice("public/".length)}`;
  if (!value.startsWith("/assets/") && !value.startsWith("/generated-assets/")) throw new Error(`Unsafe runtime URL: ${value}`);
  return value;
}

async function runCli() {
  const argv = process.argv.slice(2);
  const cwd = path.resolve(option(argv, "cwd") || process.cwd());
  const planFile = option(argv, "sourcing-plan") || "asset-sourcing-plan.json";
  const plan = JSON.parse(await readFile(path.join(cwd, planFile), "utf8"));
  const validation = await validateAssetSourcingPlan(plan, { cwd, requireResolved: true });
  if (validation.errors.length) {
    process.stdout.write(`${JSON.stringify({ status: "failed", errors: validation.errors }, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }
  const derived = deriveAssetPlans(plan);
  await Promise.all([
    writeFile(path.join(cwd, "regeneration-plan.json"), `${JSON.stringify(derived.regeneration, null, 2)}\n`),
    writeFile(path.join(cwd, "animation-plan.json"), `${JSON.stringify(derived.animation, null, 2)}\n`),
    writeFile(path.join(cwd, "asset-generation-request.json"), `${JSON.stringify(derived.generation, null, 2)}\n`),
  ]);
  process.stdout.write(`${JSON.stringify({ status: "ok", runId: plan.runId, generatedAssets: derived.generation.assets.length, generatedActions: derived.generation.actionJobs.length }, null, 2)}\n`);
}

function option(argv, name) {
  const exact = `--${name}`;
  const index = argv.indexOf(exact);
  if (index >= 0) return argv[index + 1];
  return argv.find((arg) => arg.startsWith(`${exact}=`))?.slice(exact.length + 1);
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) await runCli();
