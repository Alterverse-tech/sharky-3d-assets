import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const repo = path.resolve(new URL("..", import.meta.url).pathname);
const cli = path.join(repo, "plugins/cpt-floor/scripts/verify-preview.mjs");
const temp = await mkdtemp(path.join(os.tmpdir(), "cpt-floor-preview-bench-"));
let occupied;
let createdPid;

try {
  await mkdir(path.join(temp, "tools"), { recursive: true });
  await mkdir(path.join(temp, "floors"), { recursive: true });
  const floorFile = "floors/30F-badminton30.js";
  const source = "export default { key: 'badminton30', floor: 30 };\n";
  await writeFile(path.join(temp, floorFile), source);
  await writeFile(path.join(temp, "tools/dev-server.mjs"), `
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
const port = Number(process.argv[2]);
const root = process.cwd();
createServer((request, response) => {
  const pathname = new URL(request.url, "http://x").pathname;
  if (pathname === "/") {
    response.writeHead(200, { "content-type": "text/html" });
    response.end("preview shell");
    return;
  }
  const local = pathname.startsWith("/floors/") ? path.join(root, pathname.slice(1)) : "";
  if (local && existsSync(local)) {
    response.writeHead(200, { "content-type": "text/javascript", "content-length": statSync(local).size });
    createReadStream(local).pipe(response);
    return;
  }
  response.writeHead(404).end();
}).listen(port, "127.0.0.1");
`);

  occupied = createServer((request, response) => {
    const pathname = new URL(request.url, "http://x").pathname;
    response.writeHead(200, { "content-type": pathname.startsWith("/floors/") ? "text/javascript" : "text/html" });
    response.end(pathname.startsWith("/floors/") ? "different module" : "other server");
  });
  await new Promise((resolve) => occupied.listen(0, "127.0.0.1", resolve));
  const startingPort = occupied.address().port;
  assert.ok(startingPort < 65532, "ephemeral port must leave room for the bench range");

  const args = [cli, "--workspace", temp, "--floor-file", floorFile, "--port", String(startingPort), "--max-port", String(startingPort + 3)];
  const first = JSON.parse((await execFile(process.execPath, args)).stdout);
  createdPid = first.pid;
  assert.equal(first.reused, false);
  assert.ok(first.port > startingPort);
  assert.ok(Number.isInteger(first.pid));
  const [rootResponse, moduleResponse] = await Promise.all([fetch(first.url), fetch(first.moduleUrl)]);
  assert.equal(rootResponse.status, 200);
  assert.equal(moduleResponse.status, 200);
  assert.equal(await moduleResponse.text(), source);

  const second = JSON.parse((await execFile(process.execPath, args)).stdout);
  assert.equal(second.reused, true);
  assert.equal(second.pid, null);
  assert.equal(second.port, first.port);

  process.stdout.write("cpt-floor preview bench passed\n");
} finally {
  if (createdPid) {
    try { process.kill(createdPid, "SIGTERM"); } catch {}
  }
  if (occupied) await new Promise((resolve) => occupied.close(resolve));
  await rm(temp, { recursive: true, force: true });
}
