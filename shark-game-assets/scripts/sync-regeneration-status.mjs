#!/usr/bin/env node

import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const argv = process.argv.slice(2);
const cwd = path.resolve(option("cwd") || process.cwd());
const watch = argv.includes("--watch");
const intervalMs = Math.max(250, Number(option("interval") || 1000));
const batchRoot = path.resolve(cwd, option("batch-root") || ".asset-batches");
const statusPath = path.resolve(cwd, option("status") || "public/regeneration-status.json");
const progressMdPath = path.resolve(cwd, option("progress-md") || "animation-plan-progress.md");
const animationPlanPath = path.resolve(cwd, "animation-plan.json");
const planPath = await resolvePlanPath();
let plan;
let notBeforeMs = 0;

function option(name) {
  const exact = `--${name}`;
  const index = argv.indexOf(exact);
  if (index >= 0) return argv[index + 1];
  const prefix = `${exact}=`;
  const inline = argv.find((arg) => arg.startsWith(prefix));
  return inline?.slice(prefix.length);
}

async function resolvePlanPath() {
  const explicit = option("plan");
  if (explicit) return path.resolve(cwd, explicit);
  for (const candidate of ["regeneration-plan.json", "public/regeneration-plan.json"]) {
    const file = path.resolve(cwd, candidate);
    try {
      await stat(file);
      return file;
    } catch {
      // Try the next canonical location.
    }
  }
  throw new Error("Missing regeneration plan. Copy templates/regeneration/regeneration-plan.sample.json to regeneration-plan.json and define this run's items.");
}

async function readRequiredJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read JSON ${file}: ${error.message}`);
  }
}

function normalizePlan(raw) {
  const sourceItems = raw.items || raw.assets || [];
  if (!Array.isArray(sourceItems) || !sourceItems.length) throw new Error("regeneration-plan.json requires a non-empty items array.");
  const seen = new Set();
  const items = sourceItems.map((rawItem) => {
    const id = String(rawItem.id || "").trim();
    if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`Invalid plan item id: ${id || "<empty>"}`);
    if (seen.has(id)) throw new Error(`Duplicate plan item id: ${id}`);
    seen.add(id);
    const actionSource = rawItem.actions || rawItem.clips || [];
    const actions = [...new Set(actionSource.map((action) => String(action?.name || action).split(":").at(-1).toLowerCase()).filter(Boolean))];
    return {
      id,
      name: String(rawItem.name || id),
      role: String(rawItem.role || rawItem.gameplayRole || "prop"),
      runtimeUrl: runtimeUrlOf(rawItem),
      actions
    };
  });
  return {
    version: Number(raw.version || 1),
    runId: String(raw.runId || `regeneration-${Date.now()}`),
    startedAt: raw.startedAt || "",
    items
  };
}

function emptyClip(name) {
  return { name, status: "pending", progress: 0, runtimeUrl: "", error: "" };
}

function emptyItem(item) {
  return {
    id: item.id,
    name: item.name,
    role: item.role,
    status: "pending",
    progress: 0,
    runtimeUrl: item.runtimeUrl,
    clips: item.actions.map(emptyClip),
    error: ""
  };
}

function clampProgress(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : fallback;
}

function runtimeUrlOf(value) {
  const candidates = [value?.runtimeUrl, value?.localUrl, value?.model?.localUrl, value?.model?.url, value?.url];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    let clean = candidate.trim().replaceAll("\\", "/");
    if (/^https?:\/\//i.test(clean)) {
      try {
        clean = new URL(clean).pathname;
      } catch {
        continue;
      }
    }
    const publicIndex = clean.indexOf("/public/generated-assets/");
    if (publicIndex >= 0) clean = clean.slice(publicIndex + "/public".length);
    if (clean.startsWith("public/generated-assets/")) clean = `/${clean.slice("public/".length)}`;
    if (clean.startsWith("./generated-assets/")) clean = `/${clean.slice(2)}`;
    if (clean.startsWith("generated-assets/")) clean = `/${clean}`;
    if (clean.startsWith("/generated-assets/")) return clean;
  }
  return "";
}

function normalizeStatus(rawStatus, runtimeUrl, error, progress = 0) {
  const raw = String(rawStatus || "").toLowerCase();
  if (error || ["failed", "error", "cancelled", "canceled", "terminated"].includes(raw)) return "failed";
  if (runtimeUrl) return "ready";
  if (["success", "succeeded", "complete", "completed", "ready", "running", "processing", "generating", "queued", "submitted", "in_progress"].includes(raw)) return "running";
  return progress > 0 ? "running" : "pending";
}

function mergeClip(item, incoming) {
  const name = String(incoming.name || incoming.preset || "clip").split(":").at(-1).toLowerCase();
  let target = item.clips.find((clip) => clip.name === name);
  if (!target) {
    target = emptyClip(name);
    item.clips.push(target);
  }
  const runtimeUrl = runtimeUrlOf(incoming);
  const error = String(incoming.error || "");
  const progress = clampProgress(incoming.progress, runtimeUrl ? 100 : target.progress);
  const status = normalizeStatus(incoming.status, runtimeUrl, error, progress);
  target.status = status;
  target.progress = status === "ready" ? 100 : status === "running" ? Math.min(99, progress) : progress;
  target.runtimeUrl = runtimeUrl || target.runtimeUrl;
  target.error = error;
}

function mergeJob(item, job) {
  const runtimeUrl = runtimeUrlOf(job);
  const failed = /fail|error|cancel|terminate/i.test(job.status || "");
  const error = String(job.error || (failed ? job.message || "Generation failed" : ""));
  const progress = clampProgress(job.progress ?? job.modelProgress, item.progress);
  item.name = String(job.label || job.name || item.name);
  item.status = normalizeStatus(job.status, runtimeUrl, error, progress);
  item.progress = item.status === "ready" ? 100 : item.status === "running" ? Math.min(99, progress) : progress;
  item.runtimeUrl = runtimeUrl || item.runtimeUrl;
  item.error = error;
  for (const clip of job.rig?.animationClips || job.animationClips || []) {
    mergeClip(item, {
      ...clip,
      status: clip.status || (runtimeUrlOf(clip) ? "success" : job.rig?.status),
      progress: clip.progress ?? (runtimeUrlOf(clip) ? 100 : job.rig?.progress)
    });
  }
}

function mergeManifestAsset(item, asset) {
  const runtimeUrl = runtimeUrlOf(asset);
  const error = String(asset.error || "");
  if (asset.name) item.name = String(asset.name);
  if (runtimeUrl) {
    item.runtimeUrl = runtimeUrl;
    item.status = "ready";
    item.progress = 100;
  } else if (error) {
    item.status = "failed";
    item.error = error;
  }
  for (const [name, action] of Object.entries(asset.actions || {})) mergeClip(item, { name, ...action });
  for (const clip of asset.animationClips || []) mergeClip(item, clip);
}

async function readJson(file) {
  try {
    const [text, info] = await Promise.all([readFile(file, "utf8"), stat(file)]);
    if (notBeforeMs && info.mtimeMs + 1000 < notBeforeMs) return null;
    return { file, data: JSON.parse(text), mtimeMs: info.mtimeMs };
  } catch {
    return null;
  }
}

async function discoverSources() {
  const jobFiles = [path.join(cwd, "asset-jobs.json")];
  const manifestFiles = [path.join(cwd, "asset_manifest.json")];
  try {
    const entries = await readdir(batchRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      jobFiles.push(path.join(batchRoot, entry.name, "asset-jobs.json"));
      manifestFiles.push(path.join(batchRoot, entry.name, "asset_manifest.json"));
    }
  } catch {
    // Batch output is optional for one-batch runs.
  }
  const [jobs, manifests] = await Promise.all([Promise.all(jobFiles.map(readJson)), Promise.all(manifestFiles.map(readJson))]);
  return {
    jobs: jobs.filter(Boolean).sort((a, b) => a.mtimeMs - b.mtimeMs),
    manifests: manifests.filter(Boolean).sort((a, b) => a.mtimeMs - b.mtimeMs)
  };
}

function runtimeFilePath(runtimeUrl) {
  if (!runtimeUrl) return null;
  const relative = runtimeUrl.split(/[?#]/, 1)[0].replace(/^\/+/, "");
  const publicDir = path.resolve(cwd, "public");
  const generatedRoot = path.resolve(publicDir, "generated-assets");
  const file = path.resolve(publicDir, relative);
  if (file === generatedRoot || !file.startsWith(`${generatedRoot}${path.sep}`)) return null;
  return file;
}

async function fileExists(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

async function applyConventionalLocalFiles(item) {
  if (!item.runtimeUrl) {
    const candidateUrl = `/generated-assets/${item.id}.glb`;
    if (await fileExists(runtimeFilePath(candidateUrl))) item.runtimeUrl = candidateUrl;
  }
  for (const clip of item.clips) {
    if (clip.runtimeUrl) continue;
    const candidateUrl = `/generated-assets/${item.id}-${clip.name}.glb`;
    if (await fileExists(runtimeFilePath(candidateUrl))) clip.runtimeUrl = candidateUrl;
  }
}

async function validateRuntimeFiles(items) {
  for (const item of items) {
    await applyConventionalLocalFiles(item);
    if (item.runtimeUrl && !(await fileExists(runtimeFilePath(item.runtimeUrl)))) item.runtimeUrl = "";
    item.status = normalizeStatus(item.status, item.runtimeUrl, item.error, item.progress);
    item.progress = item.status === "ready" ? 100 : item.status === "running" ? Math.min(99, item.progress) : item.progress;
    for (const clip of item.clips) {
      if (clip.runtimeUrl && !(await fileExists(runtimeFilePath(clip.runtimeUrl)))) clip.runtimeUrl = "";
      clip.status = normalizeStatus(clip.status, clip.runtimeUrl, clip.error, clip.progress);
      clip.progress = clip.status === "ready" ? 100 : clip.status === "running" ? Math.min(99, clip.progress) : clip.progress;
    }
  }
}

function summarize(items) {
  const count = (values, status) => values.filter((value) => value.status === status).length;
  const clips = items.flatMap((item) => item.clips);
  const baseReady = count(items, "ready");
  const baseFailed = count(items, "failed");
  const baseRunning = count(items, "running");
  const clipReady = count(clips, "ready");
  const clipFailed = count(clips, "failed");
  const clipRunning = count(clips, "running");
  const finished = baseReady + baseFailed === items.length && clipReady + clipFailed === clips.length;
  const status = finished ? (baseFailed || clipFailed ? "completed_with_errors" : "ready") : baseRunning || clipRunning || baseReady ? "running" : "pending";
  const message = `${items.length} 个基础模型：${baseReady} 可预览、${baseRunning} 生成中、${baseFailed} 失败；${clips.length} 个动作模型：${clipReady} 可预览、${clipRunning} 生成中、${clipFailed} 失败。`;
  return { status, message };
}

function signatureOf(status) {
  return JSON.stringify({ status: status.status, runId: status.runId, message: status.message, items: status.items, failures: status.failures });
}

function statusBadge(status, progress) {
  if (status === "ready") return "✅";
  if (status === "failed") return "❌";
  if (status === "running") return `🔄 ${clampProgress(progress)}%`;
  return "⬜";
}

function mdCell(value) {
  return String(value ?? "").replaceAll("|", "／").replaceAll("\n", " ").trim() || "—";
}

// 当工作区存在冻结的动作确认清单（animation-plan.json，来自确认门）时，把
// 同一张表格镜像成 markdown 进度文件：每行动作带实时状态列，状态变化时整
// 文件原子覆盖。用户在编辑器里就能看进度，无需打开预览页。
async function writeAnimationPlanProgress(statusDoc, changed) {
  let animationPlan;
  try {
    animationPlan = JSON.parse(await readFile(animationPlanPath, "utf8"));
  } catch {
    return; // 没有动作确认清单的任务不产出进度 md。
  }
  if (!Array.isArray(animationPlan.assets) || !animationPlan.assets.length) return;
  if (!changed && (await fileExists(progressMdPath))) return;
  const itemsById = new Map((statusDoc.items || []).map((item) => [item.id, item]));
  const lines = [
    "# 动作生成进度",
    "",
    `- runId: \`${statusDoc.runId}\``,
    `- 更新时间: ${statusDoc.updatedAt}`,
    `- 总览: ${statusDoc.message}`,
    "",
    "| 角色/实体 | 动作 | 触发动作场景描述 | 来源 | Preset | 消耗 | 状态 |",
    "| --- | --- | --- | --- | --- | --- | --- |"
  ];
  for (const asset of animationPlan.assets) {
    const item = itemsById.get(asset.id);
    lines.push(
      `| ${mdCell(asset.name || asset.id)} | （基础模型） | — | 模型生成 | — | — | ${item ? statusBadge(item.status, item.progress) : "⬜"} |`
    );
    for (const action of asset.actions || []) {
      const isTripo = action.source === "tripo";
      const clip = item?.clips?.find((candidate) => candidate.name === String(action.name).toLowerCase());
      const source = isTripo ? "Tripo" : action.degraded ? "程序动画（超预算降级）" : "程序动画";
      const badge = isTripo ? (clip ? statusBadge(clip.status, clip.progress) : "⬜") : "✅ 运行时";
      lines.push(
        `| ${mdCell(asset.name || asset.id)} | ${mdCell(action.name)} | ${mdCell(action.scene)} | ${source} | ${isTripo ? `\`${action.preset}\`` : "—"} | ${isTripo ? 1 : 0} | ${badge} |`
      );
    }
  }
  lines.push("", "> 本文件由 sync-regeneration-status.mjs 自动覆盖维护，勿手工编辑。", "");
  const temporary = `${progressMdPath}.${process.pid}.tmp`;
  await writeFile(temporary, lines.join("\n"), "utf8");
  await rename(temporary, progressMdPath);
}

async function syncOnce() {
  plan = normalizePlan(await readRequiredJson(planPath));
  notBeforeMs = Date.parse(plan.startedAt || "") || 0;
  const items = plan.items.map(emptyItem);
  const byId = new Map(items.map((item) => [item.id, item]));
  const sources = await discoverSources();
  for (const source of sources.jobs) {
    for (const job of source.data.jobs || source.data.assets || source.data.items || []) {
      const item = byId.get(job.id);
      if (item) mergeJob(item, job);
    }
  }
  for (const source of sources.manifests) {
    for (const asset of source.data.assets || []) {
      const item = byId.get(asset.id);
      if (item) mergeManifestAsset(item, asset);
    }
  }
  await validateRuntimeFiles(items);
  for (const item of items) item.clips.sort((a, b) => plan.items.find((planItem) => planItem.id === item.id).actions.indexOf(a.name) - plan.items.find((planItem) => planItem.id === item.id).actions.indexOf(b.name));
  const summary = summarize(items);
  const failures = [];
  for (const item of items) {
    if (item.status === "failed") failures.push({ id: item.id, error: item.error || "Generation failed" });
    for (const clip of item.clips) if (clip.status === "failed") failures.push({ id: item.id, action: clip.name, error: clip.error || "Animation generation failed" });
  }
  const previous = await readJson(statusPath);
  const next = { status: summary.status, runId: plan.runId, updatedAt: previous?.data?.updatedAt || new Date(0).toISOString(), message: summary.message, items, failures };
  const changed = !(previous && signatureOf(previous.data) === signatureOf(next));
  if (changed) {
    next.updatedAt = new Date().toISOString();
    await mkdir(path.dirname(statusPath), { recursive: true });
    const temporary = `${statusPath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    await rename(temporary, statusPath);
    process.stdout.write(`[regeneration] ${next.updatedAt} ${next.message}\n`);
  }
  await writeAnimationPlanProgress(next, changed);
  return changed;
}

do {
  try {
    await syncOnce();
  } catch (error) {
    process.stderr.write(`[regeneration] sync failed: ${error.stack || error.message}\n`);
    if (!watch) process.exitCode = 1;
  }
  if (watch) await new Promise((resolve) => setTimeout(resolve, intervalMs));
} while (watch);
