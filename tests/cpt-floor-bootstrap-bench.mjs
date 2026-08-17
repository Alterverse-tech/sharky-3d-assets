import assert from "node:assert/strict";
import { execFile as execFileCallback, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  classifyOccupancy,
  isKitWorkspace,
  isProtectedPath,
  validateArchiveEntries,
} from "../plugins/cpt-floor/scripts/bootstrap.mjs";

const execFile = promisify(execFileCallback);
const repo = path.resolve(new URL("..", import.meta.url).pathname);
const cli = path.join(repo, "plugins/cpt-floor/scripts/bootstrap.mjs");

assert.doesNotThrow(() => validateArchiveEntries([
  { type: "d", name: "cpt-floor-kit/" },
  { type: "-", name: "cpt-floor-kit/tools/new-floor.mjs" },
]));
assert.throws(() => validateArchiveEntries([{ type: "-", name: "/tmp/escape" }]), /absolute/i);
assert.throws(() => validateArchiveEntries([{ type: "-", name: "cpt-floor-kit/../escape" }]), /traversal/i);
assert.throws(() => validateArchiveEntries([{ type: "l", name: "cpt-floor-kit/link" }]), /link/i);
assert.equal(isProtectedPath("floors/30F-badminton30.js"), true);
assert.equal(isProtectedPath("floors/registry.json"), true);
assert.equal(isProtectedPath(".floor-token"), true);
assert.equal(isProtectedPath("tools/validate.mjs"), false);
assert.equal(classifyOccupancy({ claims: {}, reserved: {} }, 30, "badminton30", {}), "unclaimed");
assert.equal(classifyOccupancy({ claims: {}, reserved: {} }, 30, "badminton30", { badminton30: "secret" }), "owned");
assert.throws(() => classifyOccupancy({ claims: {}, reserved: { "30-31": "built-in" } }, 30, "badminton30", {}), /reserved/);

const temp = await mkdtemp(path.join(os.tmpdir(), "cpt-floor-bootstrap-bench-"));
let server;
try {
  const fixtureParent = path.join(temp, "fixture");
  const kit = path.join(fixtureParent, "cpt-floor-kit");
  await mkdir(path.join(kit, "tools"), { recursive: true });
  await mkdir(path.join(kit, "floors"), { recursive: true });
  await writeFile(path.join(kit, "tools/new-floor.mjs"), `
import { readFile, writeFile } from "node:fs/promises";
const args = process.argv.slice(2);
const floor = Number(args[0]);
const name = args[1];
const value = (flag) => args[args.indexOf(flag) + 1];
const key = value("--key");
const author = value("--author");
const file = \`floors/\${floor}F-\${key}.js\`;
await writeFile(file, \`export default { key: '\${key}', floor: \${floor}, abi: 1, name: '\${name}', author: '\${author}', build() {} };\\n\`);
const registry = JSON.parse(await readFile("floors/registry.json", "utf8"));
registry.claims[String(floor)] = { key, name, author, file };
await writeFile("floors/registry.json", JSON.stringify(registry));
`);
  await writeFile(path.join(kit, "tools/validate.mjs"), "// kit validator v1\n");
  await writeFile(path.join(kit, "tools/dev-server.mjs"), "// kit dev server\n");
  await writeFile(path.join(kit, "floors/registry.json"), JSON.stringify({ claims: {}, reserved: {} }));
  await writeFile(path.join(kit, "FLOOR-AUTHORING.md"), "# Fixture authoring\n");

  const safeArchive = path.join(temp, "safe.tar.gz");
  execFileSync("tar", ["czf", safeArchive, "-C", fixtureParent, "cpt-floor-kit"]);
  let archiveBytes = await readFile(safeArchive);
  let registry = { claims: {}, reserved: {} };

  server = createServer((request, response) => {
    if (request.url === "/api/registry") {
      const body = Buffer.from(JSON.stringify(registry));
      response.writeHead(200, { "content-type": "application/json", "content-length": body.length });
      response.end(body);
      return;
    }
    if (request.url === "/kit.tar.gz") {
      response.writeHead(200, { "content-type": "application/gzip", "content-length": archiveBytes.length });
      response.end(archiveBytes);
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const hub = `http://127.0.0.1:${server.address().port}`;
  const workspace = path.join(temp, "workspace");
  const args = [cli, "--floor", "30", "--name", "羽毛球馆", "--key", "badminton30", "--author", "测试作者", "--workspace", workspace, "--hub", hub];

  const first = JSON.parse((await execFile(process.execPath, args)).stdout);
  assert.equal(first.mode, "created");
  assert.equal(first.floorFile, "floors/30F-badminton30.js");
  assert.equal(await isKitWorkspace(workspace), true);

  const floorPath = path.join(workspace, first.floorFile);
  const floorSentinel = "export default { key: 'badminton30', floor: 30, name: '羽毛球馆' }; // sentinel\n";
  const registrySentinel = '{"sentinel":true}\n';
  const tokenSentinel = '{"badminton30":"secret-sentinel"}\n';
  await writeFile(floorPath, floorSentinel);
  await writeFile(path.join(workspace, "floors/registry.json"), registrySentinel);
  await writeFile(path.join(workspace, ".floor-token"), tokenSentinel);
  await writeFile(path.join(workspace, "tools/validate.mjs"), "// stale validator\n");

  const second = JSON.parse((await execFile(process.execPath, args)).stdout);
  assert.equal(second.mode, "reused");
  assert.equal(second.ownership, "owned");
  assert.equal(await readFile(floorPath, "utf8"), floorSentinel);
  assert.equal(await readFile(path.join(workspace, "floors/registry.json"), "utf8"), registrySentinel);
  assert.equal(await readFile(path.join(workspace, ".floor-token"), "utf8"), tokenSentinel);
  assert.equal(await readFile(path.join(workspace, "tools/validate.mjs"), "utf8"), "// kit validator v1\n");

  registry = { claims: { "31": { key: "library31", name: "图书馆" } }, reserved: {} };
  const occupiedWorkspace = path.join(temp, "occupied");
  await assert.rejects(
    execFile(process.execPath, [cli, "--floor", "31", "--name", "影院", "--key", "cinema31", "--author", "测试作者", "--workspace", occupiedWorkspace, "--hub", hub]),
    /occupied/,
  );
  await assert.rejects(access(occupiedWorkspace));

  const unsafeParent = path.join(temp, "unsafe");
  const unsafeKit = path.join(unsafeParent, "cpt-floor-kit");
  await mkdir(unsafeKit, { recursive: true });
  await symlink("../escape", path.join(unsafeKit, "link"));
  const unsafeArchive = path.join(temp, "unsafe.tar.gz");
  execFileSync("tar", ["czf", unsafeArchive, "-C", unsafeParent, "cpt-floor-kit"]);
  archiveBytes = await readFile(unsafeArchive);
  registry = { claims: {}, reserved: {} };
  const unsafeWorkspace = path.join(temp, "unsafe-workspace");
  await assert.rejects(
    execFile(process.execPath, [cli, "--floor", "32", "--name", "球馆", "--key", "court32", "--author", "测试作者", "--workspace", unsafeWorkspace, "--hub", hub]),
    /link rejected/,
  );
  await assert.rejects(access(unsafeWorkspace));

  process.stdout.write("cpt-floor bootstrap bench passed\n");
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(temp, { recursive: true, force: true });
}
