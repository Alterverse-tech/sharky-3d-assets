#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const GLB_MODEL_SOURCES = new Set(["reuse_project", "reuse_asset_center", "generate_new"]);
const GLB_ACTION_SOURCES = new Set(["reuse_linked_action", "reuse_compatible_action", "generate_action"]);
const RUNTIME_EVIDENCE = new Set(["BROWSER_PLAYTEST", "USER_PLAYTEST", "RENDERED"]);
const PLAYED_ACTION_STATES = new Set(["playing", "played"]);
const EVIDENCE_KINDS = new Set(["screenshot", "video", "frame_sequence"]);

export async function validateGameAssetIntegration({ plan, manifest, runtimeReport, cwd = process.cwd(), requireRuntime = false } = {}) {
  const root = path.resolve(cwd);
  const errors = [];
  const checked = { glbModels: 0, glbActions: 0, primitiveSlots: 0, runtimeSlots: 0 };

  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return { errors: ["asset sourcing plan must be an object"], checked };
  if (plan.schema !== "shark-asset-sourcing-plan") errors.push('asset sourcing plan schema must be "shark-asset-sourcing-plan"');
  if (!text(plan.runId)) errors.push("asset sourcing plan runId is required");
  if (plan.confirmation?.confirmed !== true || plan.confirmation?.confirmedBy !== "user") errors.push("asset sourcing plan must contain explicit user confirmation");
  if (!Array.isArray(plan.slots) || plan.slots.length === 0) errors.push("asset sourcing plan slots must be non-empty");

  const manifestAssets = new Map((Array.isArray(manifest?.assets) ? manifest.assets : []).map((asset) => [asset?.id, asset]));
  const runtimeSlots = new Map((Array.isArray(runtimeReport?.slots) ? runtimeReport.slots : []).map((slot) => [slot?.id, slot]));

  if (requireRuntime) await validateRuntimeHeader(plan, runtimeReport, root, errors);

  for (const slot of plan.slots ?? []) {
    const id = text(slot?.id) || "<slot>";
    const modelSource = slot?.model?.source;
    const runtimeSlot = runtimeSlots.get(id);

    if (modelSource === "primitive_fallback") {
      checked.primitiveSlots += 1;
      if (requireRuntime) {
        checked.runtimeSlots += 1;
        if (!runtimeSlot) errors.push(`${id}: runtime report is missing the confirmed primitive_fallback slot`);
        else {
          if (runtimeSlot.model?.status !== "primitive_fallback") errors.push(`${id}: confirmed primitive_fallback must report model.status=primitive_fallback`);
          if (runtimeSlot.model?.visible !== true) errors.push(`${id}: confirmed primitive_fallback is not visibly present at runtime`);
        }
      }
      continue;
    }

    if (!GLB_MODEL_SOURCES.has(modelSource)) {
      errors.push(`${id}: unsupported confirmed model source ${modelSource || "<missing>"}`);
      continue;
    }

    const asset = manifestAssets.get(id);
    if (!asset) {
      errors.push(`${id}: confirmed GLB slot is missing from asset_manifest.json`);
      continue;
    }

    const modelUrl = runtimeUrlOf(asset?.model) || runtimeUrlOf(asset);
    if (!modelUrl) {
      errors.push(`${id}: confirmed GLB has no runtime model URL in asset_manifest.json`);
      continue;
    }
    if (/primitive|fallback/i.test(String(asset?.model?.source || asset?.source || ""))) {
      errors.push(`${id}: confirmed GLB was replaced by a manifest fallback`);
      continue;
    }

    const modelFile = runtimeFile(root, modelUrl);
    const modelInfo = await validateGlb(modelFile, `${id}.model`, errors);
    checked.glbModels += 1;
    await compareResolved(slot.model?.resolved, modelInfo, root, `${id}.model`, errors);
    const confirmedActions = new Map();

    for (const action of slot.actions ?? []) {
      if (!GLB_ACTION_SOURCES.has(action?.source)) continue;
      const actionName = text(action?.name) || "<action>";
      const manifestAction = asset?.actions?.[actionName] ?? legacyAction(asset, actionName);
      const actionUrl = runtimeUrlOf(manifestAction);
      if (!actionUrl) {
        errors.push(`${id}.${actionName}: confirmed action GLB is missing from asset_manifest.json`);
        continue;
      }
      const actionFile = runtimeFile(root, actionUrl);
      const actionInfo = await validateGlb(actionFile, `${id}.${actionName}`, errors);
      if (actionInfo && actionInfo.animationNames.length === 0) errors.push(`${id}.${actionName}: confirmed action GLB contains no AnimationClip`);
      confirmedActions.set(actionName, { url: actionUrl, info: actionInfo });
      checked.glbActions += 1;
      await compareResolved(action?.resolved, actionInfo, root, `${id}.${actionName}`, errors);
    }

    if (requireRuntime) {
      checked.runtimeSlots += 1;
      if (!runtimeSlot) {
        errors.push(`${id}: runtime report is missing the confirmed GLB slot`);
        continue;
      }
      if (runtimeSlot.model?.status === "primitive_fallback") {
        errors.push(`${id}: confirmed GLB is using primitive_fallback at runtime`);
      } else if (runtimeSlot.model?.status !== "loaded") {
        errors.push(`${id}: confirmed GLB must report model.status=loaded`);
      }
      if (runtimeSlot.model?.visible !== true) errors.push(`${id}: confirmed GLB is not visibly present at runtime`);
      if (runtimeSlot.model?.fallbackVisible !== false) errors.push(`${id}: confirmed GLB runtime evidence must show fallbackVisible=false`);
      if (!text(runtimeSlot.model?.objectName)) errors.push(`${id}: confirmed GLB runtime evidence requires the visible scene object name`);
      if (modelInfo?.sha256 && runtimeSlot.model?.sha256 !== modelInfo.sha256) errors.push(`${id}: runtime model sha256 does not match the manifest GLB`);
      if (modelUrl && runtimeSlot.model?.url !== modelUrl) errors.push(`${id}: runtime model URL does not match asset_manifest.json`);

      for (const action of slot.actions ?? []) {
        if (!GLB_ACTION_SOURCES.has(action?.source)) continue;
        const actionName = text(action?.name) || "<action>";
        const runtimeAction = runtimeSlot.actions?.[actionName];
        const state = runtimeAction?.status;
        if (!PLAYED_ACTION_STATES.has(state)) errors.push(`${id}.${actionName}: confirmed action GLB was not observed playing or played`);
        const expectedAction = confirmedActions.get(actionName);
        if (expectedAction?.url && runtimeAction?.url !== expectedAction.url) errors.push(`${id}.${actionName}: runtime action URL does not match asset_manifest.json`);
        if (expectedAction?.info?.sha256 && runtimeAction?.sha256 !== expectedAction.info.sha256) errors.push(`${id}.${actionName}: runtime action sha256 does not match the manifest GLB`);
        if (!text(runtimeAction?.clipName)) errors.push(`${id}.${actionName}: runtime evidence requires the played AnimationClip name`);
        else if (expectedAction?.info && !expectedAction.info.animationNames.includes(runtimeAction.clipName)) errors.push(`${id}.${actionName}: runtime clipName does not exist in the confirmed action GLB`);
      }
    }
  }

  return { errors, checked };
}

async function validateRuntimeHeader(plan, report, root, errors) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    errors.push("runtime asset report is required for --require-runtime");
    return;
  }
  if (report.schema !== "shark-game-asset-runtime-report") errors.push('runtime report schema must be "shark-game-asset-runtime-report"');
  if (report.runId !== plan.runId) errors.push("runtime report runId must match the confirmed sourcing plan");
  if (!RUNTIME_EVIDENCE.has(report.evidenceType)) errors.push("runtime report evidenceType must be BROWSER_PLAYTEST, USER_PLAYTEST, or RENDERED");
  const observedAt = Date.parse(report.observedAt || "");
  if (!text(report.observedAt) || !Number.isFinite(observedAt)) errors.push("runtime report observedAt must be an ISO timestamp");
  if (Number.isFinite(observedAt) && observedAt > Date.now() + 5 * 60 * 1000) errors.push("runtime report observedAt cannot be future-dated");
  const confirmedAt = Date.parse(plan.confirmation?.confirmedAt || "");
  if (Number.isFinite(observedAt) && Number.isFinite(confirmedAt) && observedAt < confirmedAt) errors.push("runtime report predates the confirmed sourcing plan");
  if (!Array.isArray(report.slots)) errors.push("runtime report slots must be an array");

  if (report.game?.scene !== "game") errors.push('runtime report game.scene must be "game"; the asset preview cannot prove game integration');
  let gameUrl;
  try {
    gameUrl = new URL(report.game?.url);
    if (gameUrl.protocol !== "http:" && gameUrl.protocol !== "https:") throw new Error("unsupported protocol");
    if (/\/regeneration\.html$/i.test(gameUrl.pathname)) errors.push("runtime report game.url must target the playable game, not regeneration.html");
  } catch {
    errors.push("runtime report game.url must be an absolute HTTP(S) playable-game URL");
  }

  let freshnessFloor = Number.isFinite(confirmedAt) ? confirmedAt : 0;
  const pageFile = projectFile(root, report.game?.pageFile);
  if (!pageFile) errors.push("runtime report game.pageFile must stay inside the project");
  else {
    const pageInfo = await fileDigest(pageFile, "runtime report game.pageFile", errors);
    if (pageInfo?.sha256 !== report.game?.pageSha256) errors.push("runtime report game.pageSha256 does not match the current playable page");
    freshnessFloor = Math.max(freshnessFloor, pageInfo?.mtimeMs || 0);
    try {
      const pageSource = await readFile(pageFile, "utf8");
      const entryName = path.basename(String(report.game?.entryFile || ""));
      if (!entryName || !pageSource.includes(entryName)) errors.push("runtime report game.pageFile does not reference game.entryFile");
    } catch {
      // fileDigest already reports the unreadable page.
    }
  }

  const entryFile = projectFile(root, report.game?.entryFile);
  if (!entryFile) errors.push("runtime report game.entryFile must stay inside the project");
  else {
    const entryInfo = await fileDigest(entryFile, "runtime report game.entryFile", errors);
    if (entryInfo?.sha256 !== report.game?.entrySha256) errors.push("runtime report game.entrySha256 does not match the current game entry");
    freshnessFloor = Math.max(freshnessFloor, entryInfo?.mtimeMs || 0);
  }
  if (Number.isFinite(observedAt) && freshnessFloor > observedAt + 5000) errors.push("runtime report predates the confirmed plan or current playable build");

  if (!Array.isArray(report.evidence) || report.evidence.length === 0) errors.push("runtime report requires hashed screenshot, video, or frame-sequence evidence");
  for (const [index, evidence] of (report.evidence ?? []).entries()) {
    const label = `runtime report evidence[${index}]`;
    if (!EVIDENCE_KINDS.has(evidence?.kind)) errors.push(`${label}: kind must be screenshot, video, or frame_sequence`);
    const evidenceFile = playtestEvidenceFile(root, evidence?.path);
    if (!evidenceFile) {
      errors.push(`${label}: path must stay under artifacts/playtest`);
      continue;
    }
    const evidenceInfo = await fileDigest(evidenceFile, label, errors);
    if (evidenceInfo?.sha256 !== evidence?.sha256) errors.push(`${label}: sha256 does not match the evidence file`);
    if (Number.isFinite(observedAt) && evidenceInfo?.mtimeMs > observedAt + 5000) errors.push(`${label}: file is newer than observedAt`);
    if (evidenceInfo?.mtimeMs + 5000 < freshnessFloor) errors.push(`${label}: evidence predates the confirmed plan or current playable build`);
  }
}

async function validateGlb(file, label, errors) {
  if (!file) {
    errors.push(`${label}: runtime URL must stay under public/assets or public/generated-assets`);
    return null;
  }
  try {
    const bytes = await readFile(file);
    if (bytes.length < 12 || bytes.toString("ascii", 0, 4) !== "glTF" || bytes.readUInt32LE(4) !== 2) {
      errors.push(`${label}: runtime file is not a valid GLB 2.x container`);
      return null;
    }
    if (bytes.readUInt32LE(8) !== bytes.length) errors.push(`${label}: GLB declared length does not match file size`);
    const animationNames = glbAnimationNames(bytes, label, errors);
    return { file, sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), animationNames };
  } catch (error) {
    errors.push(`${label}: runtime GLB is unavailable (${error.message})`);
    return null;
  }
}

function glbAnimationNames(bytes, label, errors) {
  if (bytes.length < 20 || bytes.readUInt32LE(16) !== 0x4e4f534a) {
    errors.push(`${label}: GLB has no readable JSON chunk`);
    return [];
  }
  const jsonLength = bytes.readUInt32LE(12);
  if (20 + jsonLength > bytes.length) {
    errors.push(`${label}: GLB JSON chunk exceeds file length`);
    return [];
  }
  try {
    const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8").trimEnd());
    return (json.animations ?? []).map((animation) => text(animation?.name)).filter(Boolean);
  } catch (error) {
    errors.push(`${label}: GLB JSON chunk cannot be parsed (${error.message})`);
    return [];
  }
}

async function compareResolved(resolved, runtimeInfo, root, label, errors) {
  if (!resolved || !runtimeInfo) return;
  const resolvedFile = workspaceFile(root, resolved.modelPath);
  if (!resolvedFile) {
    errors.push(`${label}: resolved modelPath must stay under public/assets or public/generated-assets`);
    return;
  }
  let resolvedInfo;
  try {
    const info = await stat(resolvedFile);
    if (!info.isFile()) throw new Error("not a file");
    const bytes = await readFile(resolvedFile);
    resolvedInfo = { sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  } catch (error) {
    errors.push(`${label}: resolved GLB is unavailable (${error.message})`);
    return;
  }
  if (resolvedInfo.sha256 !== runtimeInfo.sha256) errors.push(`${label}: manifest runtime GLB differs from the confirmed resolved GLB`);
  if (resolved.sha256 && resolved.sha256 !== runtimeInfo.sha256) errors.push(`${label}: runtime GLB sha256 differs from the confirmed selection`);
  if (resolved.sizeBytes && resolved.sizeBytes !== runtimeInfo.sizeBytes) errors.push(`${label}: runtime GLB size differs from the confirmed selection`);
}

function legacyAction(asset, actionName) {
  return asset?.animationClips?.find((clip) => clip?.name === actionName || clip?.preset?.endsWith(`:${actionName}`));
}

function runtimeUrlOf(value) {
  for (const candidate of [value?.runtimeUrl, value?.localUrl, value?.url]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

function runtimeFile(root, runtimeUrl) {
  if (typeof runtimeUrl !== "string" || /^https?:\/\//i.test(runtimeUrl)) return null;
  const clean = runtimeUrl.split(/[?#]/, 1)[0].replaceAll("\\", "/");
  if (!clean.startsWith("/assets/") && !clean.startsWith("/generated-assets/")) return null;
  return workspaceFile(root, `public${clean}`);
}

function workspaceFile(root, value) {
  if (typeof value !== "string") return null;
  const clean = value.replaceAll("\\", "/");
  if (!clean.startsWith("public/assets/") && !clean.startsWith("public/generated-assets/")) return null;
  const file = path.resolve(root, clean);
  const publicRoot = path.resolve(root, "public");
  const relative = path.relative(publicRoot, file);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return file;
}

function projectFile(root, value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const file = path.resolve(root, value);
  const relative = path.relative(root, file);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return file;
}

function playtestEvidenceFile(root, value) {
  if (typeof value !== "string") return null;
  const clean = value.replaceAll("\\", "/");
  if (!clean.startsWith("artifacts/playtest/")) return null;
  return projectFile(root, clean);
}

async function fileDigest(file, label, errors) {
  try {
    const [bytes, info] = await Promise.all([readFile(file), stat(file)]);
    if (!info.isFile() || bytes.length === 0) throw new Error("not a non-empty file");
    return { sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.length, mtimeMs: info.mtimeMs };
  } catch (error) {
    errors.push(`${label}: unavailable (${error.message})`);
    return null;
  }
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function option(argv, name) {
  const exact = `--${name}`;
  const index = argv.indexOf(exact);
  if (index >= 0) return argv[index + 1];
  return argv.find((arg) => arg.startsWith(`${exact}=`))?.slice(exact.length + 1);
}

async function readJson(file, label, errors, required = true) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (required) errors.push(`${label}: ${error.message}`);
    return null;
  }
}

async function runCli() {
  const argv = process.argv.slice(2);
  const cwd = path.resolve(option(argv, "cwd") || process.cwd());
  const requireRuntime = argv.includes("--require-runtime");
  const readErrors = [];
  const planFile = path.resolve(cwd, option(argv, "plan") || "asset-sourcing-plan.json");
  const manifestFile = path.resolve(cwd, option(argv, "manifest") || "asset_manifest.json");
  const reportFile = path.resolve(cwd, option(argv, "runtime-report") || "artifacts/playtest/asset-runtime-report.json");
  const plan = await readJson(planFile, path.basename(planFile), readErrors);
  const manifest = await readJson(manifestFile, path.basename(manifestFile), readErrors);
  const runtimeReport = await readJson(reportFile, path.relative(cwd, reportFile), readErrors, requireRuntime);
  const result = readErrors.length
    ? { errors: readErrors, checked: { glbModels: 0, glbActions: 0, primitiveSlots: 0, runtimeSlots: 0 } }
    : await validateGameAssetIntegration({ plan, manifest, runtimeReport, cwd, requireRuntime });
  const output = { status: result.errors.length ? "failed" : "ok", cwd, requireRuntime, checked: result.checked, errors: result.errors };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (result.errors.length) process.exitCode = 1;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) await runCli();
