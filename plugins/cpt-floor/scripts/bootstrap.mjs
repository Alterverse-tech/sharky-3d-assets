#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFile = promisify(execFileCallback);
const DEFAULT_HUB = "https://cpt-tower.13-216-49-19.sslip.io";
const KEY_RE = /^[a-z][a-z0-9-]{1,23}$/;
const REQUIRED_WORKSPACE_FILES = [
  "tools/new-floor.mjs",
  "tools/validate.mjs",
  "tools/dev-server.mjs",
  "floors/registry.json",
];

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export async function isKitWorkspace(root) {
  return (await Promise.all(REQUIRED_WORKSPACE_FILES.map((rel) => exists(path.join(root, rel))))).every(Boolean);
}

export function isProtectedPath(rel) {
  const normalized = rel.replaceAll("\\", "/").replace(/^\.\//, "");
  return normalized === ".floor-token" || normalized === "floors/registry.json" ||
    (normalized.startsWith("floors/") && normalized.endsWith(".js"));
}

export function validateArchiveEntries(entries) {
  if (!entries.length) throw new Error("archive is empty");
  for (const { type, name } of entries) {
    if (type === "l" || type === "h") throw new Error(`archive link rejected: ${name}`);
    if (name.startsWith("/") || /^[A-Za-z]:[\\/]/.test(name)) {
      throw new Error(`archive absolute path rejected: ${name}`);
    }
    const parts = name.replaceAll("\\", "/").split("/").filter(Boolean);
    if (parts.includes("..")) throw new Error(`archive traversal rejected: ${name}`);
    if (parts[0] !== "cpt-floor-kit") throw new Error(`archive root rejected: ${name}`);
  }
}

function inReservedRange(floor, range) {
  const [start, end = start] = String(range).split("-").map(Number);
  return Number.isFinite(start) && Number.isFinite(end) && floor >= start && floor <= end;
}

export function classifyOccupancy(registry, floor, key, tokens = {}) {
  for (const [range, owner] of Object.entries(registry?.reserved || {})) {
    if (inReservedRange(floor, range)) throw new Error(`floor ${floor} is reserved by ${owner}`);
  }
  const claim = registry?.claims?.[String(floor)];
  if (claim && claim.key !== key) {
    throw new Error(`floor ${floor} is occupied by ${claim.key}${claim.name ? ` (${claim.name})` : ""}`);
  }
  if (claim && !tokens[key]) throw new Error(`floor ${floor} is already claimed and no local ownership token exists`);
  return claim || tokens[key] ? "owned" : "unclaimed";
}

function parseArgs(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") return { help: true };
    if (!arg.startsWith("--")) throw new Error(`unexpected argument: ${arg}`);
    const name = arg.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing value for --${name}`);
    values[name] = value;
    i += 1;
  }
  const floor = Number(values.floor);
  if (!Number.isInteger(floor) || floor < 1 || floor > 136) throw new Error("--floor must be an integer from 1 to 136");
  if (!values.name) throw new Error("--name is required");
  if (!KEY_RE.test(values.key || "")) throw new Error("--key must be 2-24 lowercase letters, digits, or hyphens and start with a letter");
  if (!values.author) throw new Error("--author is required");
  for (const [label, value] of [["name", values.name], ["author", values.author]]) {
    if (/[\\'\r\n]/.test(value)) throw new Error(`--${label} contains unsupported quote, slash, or newline characters`);
  }
  return {
    floor,
    name: values.name,
    key: values.key,
    author: values.author,
    workspace: values.workspace ? path.resolve(values.workspace) : null,
    hub: (values.hub || DEFAULT_HUB).replace(/\/$/, ""),
  };
}

function help() {
  return `Usage:
  node scripts/bootstrap.mjs --floor 30 --name 羽毛球馆 --key badminton30 --author 作者
    [--workspace /absolute/path] [--hub https://host]

stdout: one JSON result object
stderr: progress and errors
`;
}

async function readTokens(workspace) {
  try {
    const value = JSON.parse(await readFile(path.join(workspace, ".floor-token"), "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "user-agent": "cpt-floor-plugin" } });
  if (!response.ok) throw new Error(`registry request failed: HTTP ${response.status}`);
  const data = await response.json();
  if (!data || typeof data !== "object" || typeof data.claims !== "object" || typeof data.reserved !== "object") {
    throw new Error("registry response has an invalid shape");
  }
  return data;
}

async function download(url, target) {
  const response = await fetch(url, { headers: { "user-agent": "cpt-floor-plugin" } });
  if (!response.ok) throw new Error(`kit download failed: HTTP ${response.status}`);
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
}

async function listArchive(archive) {
  const [{ stdout: namesOut }, { stdout: verboseOut }] = await Promise.all([
    execFile("tar", ["-tzf", archive], { maxBuffer: 8 * 1024 * 1024 }),
    execFile("tar", ["-tvzf", archive], { maxBuffer: 8 * 1024 * 1024 }),
  ]);
  const names = namesOut.split("\n").filter(Boolean);
  const verbose = verboseOut.split("\n").filter(Boolean);
  if (names.length !== verbose.length) throw new Error("archive listing could not be verified");
  return names.map((name, index) => ({ type: verbose[index][0], name }));
}

async function assertStagedKit(root) {
  if (!(await isKitWorkspace(root))) {
    const missing = [];
    for (const rel of REQUIRED_WORKSPACE_FILES) if (!(await exists(path.join(root, rel)))) missing.push(rel);
    throw new Error(`developer kit is missing required files: ${missing.join(", ")}`);
  }
}

async function refreshKit(sourceRoot, targetRoot, rel = "") {
  const entries = await readdir(path.join(sourceRoot, rel), { withFileTypes: true });
  for (const entry of entries) {
    const childRel = rel ? path.join(rel, entry.name) : entry.name;
    if (isProtectedPath(childRel)) continue;
    const from = path.join(sourceRoot, childRel);
    const to = path.join(targetRoot, childRel);
    if (entry.isDirectory()) {
      await mkdir(to, { recursive: true });
      await refreshKit(sourceRoot, targetRoot, childRel);
    } else if (entry.isFile()) {
      await mkdir(path.dirname(to), { recursive: true });
      await copyFile(from, to);
    } else {
      throw new Error(`unsupported staged kit entry: ${childRel}`);
    }
  }
}

function readFloorMetadata(source) {
  const key = source.match(/\bkey\s*:\s*['"]([^'"]+)['"]/)?.[1];
  const floor = Number(source.match(/\bfloor\s*:\s*(\d+)/)?.[1]);
  const name = source.match(/\bname\s*:\s*['"]([^'"]+)['"]/)?.[1];
  return { key, floor, name };
}

async function resolveWorkspace(options) {
  if (options.workspace) return options.workspace;
  const current = process.cwd();
  if (await isKitWorkspace(current)) return current;
  return path.join(os.homedir(), "CPT-Tower-Floors", `${options.floor}-${options.key}`);
}

export async function bootstrap(options) {
  const workspace = await resolveWorkspace(options);
  const workspaceExists = await exists(workspace);
  const reusable = workspaceExists && await isKitWorkspace(workspace);
  if (workspaceExists && !reusable) throw new Error(`workspace exists but is not a valid developer kit: ${workspace}`);

  const tokens = reusable ? await readTokens(workspace) : {};
  const registry = await fetchJson(`${options.hub}/api/registry`);
  const ownership = classifyOccupancy(registry, options.floor, options.key, tokens);
  const temp = await mkdtemp(path.join(os.tmpdir(), "cpt-floor-"));

  try {
    const archive = path.join(temp, "kit.tar.gz");
    const staging = path.join(temp, "staging");
    await mkdir(staging);
    process.stderr.write("Downloading current CPT floor kit...\n");
    await download(`${options.hub}/kit.tar.gz`, archive);
    validateArchiveEntries(await listArchive(archive));
    await execFile("tar", ["-xzf", archive, "-C", staging]);
    const stagedKit = path.join(staging, "cpt-floor-kit");
    await assertStagedKit(stagedKit);

    if (reusable) {
      await refreshKit(stagedKit, workspace);
    } else {
      await mkdir(path.dirname(workspace), { recursive: true });
      if (await exists(workspace)) throw new Error(`workspace appeared during setup: ${workspace}`);
      await rename(stagedKit, workspace);
    }

    const floorFile = `floors/${options.floor}F-${options.key}.js`;
    const absoluteFloorFile = path.join(workspace, floorFile);
    if (await exists(absoluteFloorFile)) {
      const meta = readFloorMetadata(await readFile(absoluteFloorFile, "utf8"));
      if (meta.floor !== options.floor || meta.key !== options.key || meta.name !== options.name) {
        throw new Error(`existing floor metadata does not match request: ${floorFile}`);
      }
    } else {
      await execFile(process.execPath, [
        "tools/new-floor.mjs",
        String(options.floor),
        options.name,
        "--key",
        options.key,
        "--author",
        options.author,
      ], { cwd: workspace, maxBuffer: 8 * 1024 * 1024 });
      if (!(await exists(absoluteFloorFile))) throw new Error(`scaffolder did not create ${floorFile}`);
    }

    return {
      workspace,
      floorFile,
      absoluteFloorFile,
      mode: reusable ? "reused" : "created",
      ownership,
      commands: {
        validate: ["node", "tools/validate.mjs", floorFile],
        preview: ["node", "tools/dev-server.mjs"],
      },
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(help());
    return;
  }
  const result = await bootstrap(options);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`cpt-floor bootstrap failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
