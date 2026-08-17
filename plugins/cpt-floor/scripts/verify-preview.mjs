#!/usr/bin/env node

import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

function help() {
  return `Usage:
  node scripts/verify-preview.mjs --workspace /absolute/path --floor-file floors/30F-badminton30.js
    [--port 3200] [--max-port 3220]

Starts or reuses a matching local dev server and prints one JSON result.
`;
}

function parseArgs(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") return { help: true };
    if (!arg.startsWith("--")) throw new Error(`unexpected argument: ${arg}`);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing value for ${arg}`);
    values[arg.slice(2)] = value;
    i += 1;
  }
  if (!values.workspace) throw new Error("--workspace is required");
  if (!values["floor-file"]) throw new Error("--floor-file is required");
  const port = Number(values.port || 3200);
  const maxPort = Number(values["max-port"] || 3220);
  if (!Number.isInteger(port) || !Number.isInteger(maxPort) || port < 1 || maxPort > 65535 || maxPort < port) {
    throw new Error("port range must contain integers from 1 to 65535");
  }
  return {
    workspace: path.resolve(values.workspace),
    floorFile: values["floor-file"].replaceAll("\\", "/"),
    port,
    maxPort,
  };
}

async function validateFloorPath(workspace, floorFile) {
  if (path.isAbsolute(floorFile) || !floorFile.startsWith("floors/") || floorFile.split("/").includes("..")) {
    throw new Error("--floor-file must be a relative path inside floors/");
  }
  const absolute = path.resolve(workspace, floorFile);
  if (!absolute.startsWith(`${workspace}${path.sep}`)) throw new Error("--floor-file escapes the workspace");
  await access(absolute);
  return absolute;
}

export async function probePreview(port, floorFile, expectedSource) {
  const base = `http://127.0.0.1:${port}`;
  try {
    const [root, floor] = await Promise.all([
      fetch(`${base}/`),
      fetch(`${base}/${floorFile}`),
    ]);
    const source = floor.ok ? await floor.text() : "";
    const type = floor.headers.get("content-type") || "";
    return root.status === 200 && floor.status === 200 && /javascript/i.test(type) && source === expectedSource;
  } catch {
    return false;
  }
}

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(300);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function verifyPreview(options) {
  const absoluteFloor = await validateFloorPath(options.workspace, options.floorFile);
  const expectedSource = await readFile(absoluteFloor, "utf8");

  for (let port = options.port; port <= options.maxPort; port += 1) {
    if (await probePreview(port, options.floorFile, expectedSource)) {
      return {
        port,
        pid: null,
        reused: true,
        url: `http://localhost:${port}/?dev=${options.floorFile}`,
        moduleUrl: `http://localhost:${port}/${options.floorFile}`,
        logFile: null,
      };
    }
    if (await portInUse(port)) continue;

    const logFile = path.join(options.workspace, `.cpt-dev-server-${port}.log`);
    const log = openSync(logFile, "a");
    const child = spawn(process.execPath, ["tools/dev-server.mjs", String(port)], {
      cwd: options.workspace,
      detached: true,
      stdio: ["ignore", log, log],
    });
    closeSync(log);
    let exited = false;
    child.once("exit", () => { exited = true; });
    child.unref();

    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (await probePreview(port, options.floorFile, expectedSource)) {
        return {
          port,
          pid: child.pid,
          reused: false,
          url: `http://localhost:${port}/?dev=${options.floorFile}`,
          moduleUrl: `http://localhost:${port}/${options.floorFile}`,
          logFile,
        };
      }
      if (exited) throw new Error(`dev server exited before readiness; inspect ${logFile}`);
      await wait(100);
    }
    try { process.kill(child.pid, "SIGTERM"); } catch {}
    throw new Error(`dev server readiness timed out; inspect ${logFile}`);
  }
  throw new Error(`no matching or free preview port in ${options.port}-${options.maxPort}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(help());
    return;
  }
  process.stdout.write(`${JSON.stringify(await verifyPreview(options))}\n`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`cpt-floor preview failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
