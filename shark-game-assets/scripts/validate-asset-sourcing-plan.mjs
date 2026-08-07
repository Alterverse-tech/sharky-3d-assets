#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const MODEL_SOURCES = new Set(["reuse_project", "reuse_asset_center", "generate_new", "primitive_fallback"]);
const ACTION_SOURCES = new Set(["reuse_linked_action", "reuse_compatible_action", "generate_action", "runtime_procedural", "primitive_fallback"]);

export async function validateAssetSourcingPlan(plan, { cwd = process.cwd(), requireResolved = false } = {}) {
  const root = path.resolve(cwd);
  const errors = [];
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    return { errors: ["plan must be an object"], currentTaskAuthorization: "not_evaluated" };
  }
  rejectRemoteUrls(plan, "$", errors);
  if (plan.schema !== "shark-asset-sourcing-plan") errors.push('schema must be "shark-asset-sourcing-plan"');
  if (!text(plan.runId)) errors.push("runId is required");
  if (!plan.confirmation || plan.confirmation.confirmed !== true || plan.confirmation.confirmedBy !== "user" || !text(plan.confirmation.confirmedAt)) {
    errors.push("confirmation audit metadata is required for a frozen selection snapshot; disk metadata does not establish current-task authorization");
  }
  if (!Array.isArray(plan.slots) || plan.slots.length === 0) errors.push("slots must be non-empty");

  const ids = new Set();
  for (const slot of plan.slots ?? []) {
    const owner = text(slot?.id) ? slot.id : "<slot>";
    if (!/^[a-z0-9][a-z0-9-]*$/.test(owner)) errors.push(`${owner}: invalid slot id`);
    if (ids.has(owner)) errors.push(`${owner}: duplicate slot id`);
    ids.add(owner);
    if (!slot?.model || !MODEL_SOURCES.has(slot.model.source)) {
      errors.push(`${owner}: invalid model source`);
      continue;
    }
    await validateModel(slot, root, requireResolved, errors);
    if (!Array.isArray(slot.actions)) {
      errors.push(`${owner}: actions must be an array`);
      continue;
    }
    const actionNames = new Set();
    for (const action of slot.actions) {
      const label = `${owner}.${action?.name || "<action>"}`;
      if (!/^[a-z][a-z0-9_]*$/.test(action?.name ?? "")) errors.push(`${label}: invalid action name`);
      if (actionNames.has(action?.name)) errors.push(`${label}: duplicate action name`);
      actionNames.add(action?.name);
      if (!text(action?.scene)) errors.push(`${label}: scene is required`);
      if (!ACTION_SOURCES.has(action?.source)) {
        errors.push(`${label}: invalid action source`);
        continue;
      }
      await validateAction(slot, action, root, requireResolved, errors);
    }
  }
  return { errors, currentTaskAuthorization: "not_evaluated" };
}

async function validateModel(slot, root, requireResolved, errors) {
  const model = slot.model;
  const owner = `${slot.id}.model`;
  if ((model.source === "reuse_project" || model.source === "reuse_asset_center") && !text(model.assetId)) errors.push(`${owner}: reused model requires assetId`);
  if ((model.source === "generate_new" || model.source === "primitive_fallback") && model.assetId !== undefined) errors.push(`${owner}: ${model.source} cannot carry assetId`);
  if (!requireResolved || (model.source !== "reuse_project" && model.source !== "reuse_asset_center")) return;
  await validateResolution(model.resolved, model.source === "reuse_asset_center" ? "asset_center" : "project", owner, root, errors);
}

async function validateAction(slot, action, root, requireResolved, errors) {
  const owner = `${slot.id}.${action.name}`;
  if (action.source === "reuse_linked_action" || action.source === "reuse_compatible_action") {
    if (!text(action.assetId)) errors.push(`${owner}: reused action requires assetId`);
    if (action.source === "reuse_linked_action" && action.parentAssetId !== slot.model.assetId) {
      errors.push(`${owner}: linked action parentAssetId must match selected model assetId`);
    }
    if (action.source === "reuse_compatible_action" && action.compatibility?.status !== "verified") {
      errors.push(`${owner}: compatible action requires compatibility.status=verified`);
    }
    if (requireResolved) {
      const origin = action.resolved?.origin;
      if (origin !== "project" && origin !== "asset_center") errors.push(`${owner}: resolved.origin must be project or asset_center`);
      else await validateResolution(action.resolved, origin, owner, root, errors);
    }
    return;
  }
  if (action.assetId !== undefined || action.parentAssetId !== undefined) errors.push(`${owner}: ${action.source} cannot carry asset ids`);
  if (action.source === "generate_action") {
    if (!text(action.generator) || !text(action.preset)) errors.push(`${owner}: generated action requires generator and preset`);
    const reusedBase = slot.model.source === "reuse_project" || slot.model.source === "reuse_asset_center";
    if (reusedBase && action.generationRoute?.supportedForReusedBase !== true) {
      errors.push(`${owner}: generation route cannot animate the reused base`);
    }
  }
}

async function validateResolution(resolved, origin, owner, root, errors) {
  if (!resolved || typeof resolved !== "object" || Array.isArray(resolved)) {
    errors.push(`${owner}: resolved metadata is required`);
    return;
  }
  const modelPath = text(resolved.modelPath);
  if (!modelPath) {
    errors.push(`${owner}: resolved.modelPath is required`);
  } else {
    const file = safeWorkspaceFile(root, modelPath);
    if (!file) errors.push(`${owner}: modelPath must stay under public/assets or public/generated-assets`);
    else {
      try {
        if (!(await stat(file)).isFile()) errors.push(`${owner}: resolved modelPath is not a file`);
      } catch {
        errors.push(`${owner}: resolved modelPath does not exist`);
      }
    }
  }
  if (origin === "asset_center") {
    if (!/^[a-f0-9]{64}$/.test(resolved.sha256 ?? "")) errors.push(`${owner}: Asset Center resolution requires lowercase sha256`);
    if (!Number.isSafeInteger(resolved.sizeBytes) || resolved.sizeBytes <= 0) errors.push(`${owner}: Asset Center resolution requires sizeBytes`);
  } else {
    if (resolved.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(resolved.sha256)) errors.push(`${owner}: invalid optional sha256`);
    if (resolved.sizeBytes !== undefined && (!Number.isSafeInteger(resolved.sizeBytes) || resolved.sizeBytes <= 0)) errors.push(`${owner}: invalid optional sizeBytes`);
  }
}

function safeWorkspaceFile(root, value) {
  if (typeof value !== "string") return null;
  const normalized = value.replaceAll("\\", "/");
  if (!normalized.startsWith("public/assets/") && !normalized.startsWith("public/generated-assets/")) return null;
  const file = path.resolve(root, normalized);
  const assets = path.resolve(root, "public/assets");
  const generated = path.resolve(root, "public/generated-assets");
  if (!inside(assets, file) && !inside(generated, file)) return null;
  return file;
}

function inside(root, file) {
  const relative = path.relative(root, file);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function rejectRemoteUrls(value, label, errors) {
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) errors.push(`${label}: persisted remote URLs are forbidden`);
    return;
  }
  if (Array.isArray(value)) return value.forEach((entry, index) => rejectRemoteUrls(entry, `${label}[${index}]`, errors));
  if (value && typeof value === "object") for (const [key, entry] of Object.entries(value)) rejectRemoteUrls(entry, `${label}.${key}`, errors);
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

async function runCli() {
  const argv = process.argv.slice(2);
  const cwd = path.resolve(option(argv, "cwd") || process.cwd());
  const planFile = option(argv, "plan") || "asset-sourcing-plan.json";
  let plan;
  try {
    plan = JSON.parse(await readFile(path.join(cwd, planFile), "utf8"));
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ status: "failed", cwd, plan: planFile, currentTaskAuthorization: "not_evaluated", errors: [`${planFile}: ${error.message}`] }, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }
  const result = await validateAssetSourcingPlan(plan, { cwd, requireResolved: argv.includes("--require-resolved") });
  process.stdout.write(`${JSON.stringify({ status: result.errors.length ? "failed" : "ok", cwd, plan: planFile, currentTaskAuthorization: result.currentTaskAuthorization, errors: result.errors }, null, 2)}\n`);
  if (result.errors.length) process.exitCode = 1;
}

function option(argv, name) {
  const exact = `--${name}`;
  const index = argv.indexOf(exact);
  if (index >= 0) return argv[index + 1];
  return argv.find((arg) => arg.startsWith(`${exact}=`))?.slice(exact.length + 1);
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) await runCli();
