#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const argv = process.argv.slice(2);
const cwd = path.resolve(option("cwd") || process.cwd());
const errors = [];

function option(name) {
  const exact = `--${name}`;
  const index = argv.indexOf(exact);
  if (index >= 0) return argv[index + 1];
  const prefix = `${exact}=`;
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function text(file) {
  try {
    return await readFile(path.join(cwd, file), "utf8");
  } catch (error) {
    errors.push(`${file}: ${error.message}`);
    return "";
  }
}

async function json(file) {
  const source = await text(file);
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch (error) {
    errors.push(`${file}: invalid JSON (${error.message})`);
    return null;
  }
}

function requirePatterns(file, source, patterns) {
  for (const [label, pattern] of patterns) if (!pattern.test(source)) errors.push(`${file}: missing ${label}`);
}

function runtimeFile(runtimeUrl) {
  if (typeof runtimeUrl !== "string" || (!runtimeUrl.startsWith("/generated-assets/") && !runtimeUrl.startsWith("/assets/"))) return null;
  const publicDir = path.resolve(cwd, "public");
  const generatedRoot = path.resolve(publicDir, "generated-assets");
  const assetsRoot = path.resolve(publicDir, "assets");
  const file = path.resolve(publicDir, runtimeUrl.replace(/^\/+/, "").split(/[?#]/, 1)[0]);
  if (!file.startsWith(`${generatedRoot}${path.sep}`) && !file.startsWith(`${assetsRoot}${path.sep}`)) return null;
  return file;
}

async function validateReadyFile(owner, runtimeUrl) {
  const file = runtimeFile(runtimeUrl);
  if (!file) {
    errors.push(`${owner}: ready runtimeUrl must be under /generated-assets/ or /assets/`);
    return;
  }
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size === 0) errors.push(`${owner}: runtime file is empty or not a file (${file})`);
  } catch {
    errors.push(`${owner}: runtime file does not exist (${file})`);
  }
}

const html = await text("public/regeneration.html");
const source = await text("src/regeneration-preview.js");
requirePatterns("public/regeneration.html", html, [
  [".app root", /class=["']app["']/],
  ["#list", /id=["']list["']/],
  ["#stage", /id=["']stage["']/],
  ["#status", /id=["']status["']/],
  ["preview bundle", /regeneration-preview\.bundle\.js/]
]);
requirePatterns("src/regeneration-preview.js", source, [
  ["status polling", /regeneration-status\.json/],
  ["GLTFLoader", /new GLTFLoader/],
  ["OrbitControls", /new OrbitControls/],
  ["renderer canvas mount", /stage\.appendChild/],
  ["2 second poll", /setInterval\(poll,\s*2000\)/],
  ["clip-aware signature", /item\.clips/],
  ["base-model action playback", /loadActionClip/]
]);

try {
  const info = await stat(path.join(cwd, "public/regeneration-preview.bundle.js"));
  if (!info.isFile() || info.size < 1000) errors.push("public/regeneration-preview.bundle.js: missing or unexpectedly small");
} catch {
  errors.push("public/regeneration-preview.bundle.js: missing");
}

const plan = await json("regeneration-plan.json");
if (plan) {
  if (!plan.runId) errors.push("regeneration-plan.json: missing runId");
  if (!Array.isArray(plan.items) || !plan.items.length) errors.push("regeneration-plan.json: items must be non-empty");
  const ids = new Set();
  for (const item of plan.items || []) {
    if (!item.id || !/^[a-z0-9][a-z0-9-]*$/.test(item.id)) errors.push(`regeneration-plan.json: invalid id ${item.id || "<empty>"}`);
    if (ids.has(item.id)) errors.push(`regeneration-plan.json: duplicate id ${item.id}`);
    ids.add(item.id);
    if (!Array.isArray(item.actions)) errors.push(`regeneration-plan.json: ${item.id}.actions must be an array`);
  }
}

const status = await json("public/regeneration-status.json");
if (status) {
  if (!Array.isArray(status.items)) errors.push("public/regeneration-status.json: items must be an array");
  for (const item of status.items || []) {
    for (const field of ["id", "name", "role", "status", "progress", "runtimeUrl", "clips", "error"]) {
      if (!(field in item)) errors.push(`public/regeneration-status.json: ${item.id || "<unknown>"} missing ${field}`);
    }
    if (item.status === "ready") await validateReadyFile(item.id, item.runtimeUrl);
    for (const clip of item.clips || []) {
      for (const field of ["name", "status", "progress", "runtimeUrl", "error"]) if (!(field in clip)) errors.push(`public/regeneration-status.json: ${item.id} clip missing ${field}`);
      if (clip.status === "ready") await validateReadyFile(`${item.id}:${clip.name}`, clip.runtimeUrl);
    }
  }
}

if (plan && status) {
  if (status.runId !== plan.runId) errors.push(`runId mismatch: plan=${plan.runId} status=${status.runId}`);
  const planById = new Map((plan.items || []).map((item) => [item.id, item]));
  const statusById = new Map((status.items || []).map((item) => [item.id, item]));
  for (const [id, item] of planById) {
    const statusItem = statusById.get(id);
    if (!statusItem) {
      errors.push(`public/regeneration-status.json: missing planned item ${id}`);
      continue;
    }
    const expectedActions = new Set(item.actions || []);
    const actualActions = new Set((statusItem.clips || []).map((clip) => clip.name));
    for (const action of expectedActions) if (!actualActions.has(action)) errors.push(`public/regeneration-status.json: ${id} missing planned action ${action}`);
    for (const action of actualActions) if (!expectedActions.has(action)) errors.push(`public/regeneration-status.json: ${id} contains unplanned action ${action}`);
  }
  for (const id of statusById.keys()) if (!planById.has(id)) errors.push(`public/regeneration-status.json: contains unplanned historical item ${id}`);
}

const result = { status: errors.length ? "failed" : "ok", cwd, errors };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (errors.length) process.exitCode = 1;
