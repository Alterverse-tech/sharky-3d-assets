#!/usr/bin/env node
// Offline bench for the client's TLS trust handling (issue #3).
// No real service required: spins a local HTTPS server with a throwaway CA
// and drives `game-assets-mcp.mjs readiness` against it.
//
// Scenarios:
//   A. unknown CA, no override  -> must FAIL verification with a TLS error
//      (proves cert checking stays on and the bundled anchor does not
//      blanket-trust).
//   B. GAME_ASSETS_CA_FILE=<bench CA> -> must succeed (env override works).
//   C. --ca-file <bench CA>          -> must succeed (flag override works).
//   D. client source must not contain rejectUnauthorized (red line).
//   E. bundled anchor must parse as >=1 currently-valid X509 certificate
//      (a deleted/garbled/expired anchor file must fail the bench).
//   F. NODE_EXTRA_CA_CERTS=<bench CA> -> must succeed (the explicit ca
//      array must not drop Node's platform-level extra-trust mechanism).
//
// Usage: node tests/ca-trust-bench.mjs

import { execFileSync, execFile } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientPath = path.join(repoRoot, "shark-game-assets", "scripts", "game-assets-mcp.mjs");
const work = mkdtempSync(path.join(os.tmpdir(), "ca-bench-"));
const results = [];

function sh(cmd, args) {
  execFileSync(cmd, args, { cwd: work, stdio: ["ignore", "ignore", "ignore"] });
}

function runClient(env, extraArgs = []) {
  return new Promise((resolve) => {
    execFile(
      "node",
      [clientPath, "readiness", "--cwd", work, ...extraArgs],
      { env: { ...process.env, ...env }, timeout: 30000 },
      (error, stdout) => {
        try {
          resolve(JSON.parse(stdout));
        } catch {
          resolve({ parseError: true, stdout: String(stdout).slice(0, 400), spawnError: error?.message });
        }
      }
    );
  });
}

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

// --- throwaway CA + leaf for 127.0.0.1 ---
sh("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "ca.key", "-out", "ca.pem", "-days", "2", "-subj", "/CN=CA Bench Root"]);
sh("openssl", ["req", "-newkey", "rsa:2048", "-nodes", "-keyout", "srv.key", "-out", "srv.csr", "-subj", "/CN=127.0.0.1"]);
writeFileSync(path.join(work, "ext.cnf"), "subjectAltName=IP:127.0.0.1\n");
sh("openssl", ["x509", "-req", "-in", "srv.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial", "-out", "srv.pem", "-days", "2", "-extfile", "ext.cnf"]);

const server = https.createServer(
  { key: readFileSync(path.join(work, "srv.key")), cert: readFileSync(path.join(work, "srv.pem")) },
  (request, response) => {
    if (request.url === "/api/asset-jobs/readiness") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "ok" }));
    } else {
      response.writeHead(404);
      response.end("{}");
    }
  }
);

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `https://127.0.0.1:${server.address().port}`;
const benchCa = path.join(work, "ca.pem");

// A. unknown CA must be rejected, and for a TLS-verification reason
const a = await runClient({ GAME_ASSETS_API_URL: base, GAME_ASSETS_CA_FILE: "" });
const aTlsReason = /unable to verify|self.signed|unable to get|certificate/i.test(a.remote?.message || "");
record("A: unknown CA rejected (TLS reason)", a.remote?.status === "unreachable" && aTlsReason, a.remote?.message?.slice(0, 80));

// B. env override trusts the bench CA
const b = await runClient({ GAME_ASSETS_API_URL: base, GAME_ASSETS_CA_FILE: benchCa });
record("B: GAME_ASSETS_CA_FILE works", b.status === "ok" && b.remote?.status === "ok", b.remote?.status);

// C. --ca-file flag trusts the bench CA
const c = await runClient({ GAME_ASSETS_API_URL: base, GAME_ASSETS_CA_FILE: "" }, ["--ca-file", benchCa]);
record("C: --ca-file works", c.status === "ok" && c.remote?.status === "ok", c.remote?.status);

// D. red line: verification must never be disabled in the client source
const source = readFileSync(clientPath, "utf8");
record("D: no rejectUnauthorized in client", !/rejectUnauthorized/.test(source));

// E. the bundled anchor itself must be structurally sound and in validity
try {
  const bundled = readFileSync(path.join(repoRoot, "shark-game-assets", "scripts", "certs", "asset-service-ca.pem"), "utf8");
  const pems = bundled.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) || [];
  const now = Date.now();
  const parsed = pems.map((pem) => new X509Certificate(pem));
  const allValid = parsed.length > 0 && parsed.every((cert) => Date.parse(cert.validFrom) <= now && now <= Date.parse(cert.validTo));
  record("E: bundled anchor parses and is valid", allValid, parsed.map((cert) => cert.subject.split("\n").pop()).join(", ") || "no certs found");
} catch (error) {
  record("E: bundled anchor parses and is valid", false, error.message.slice(0, 80));
}

// F. NODE_EXTRA_CA_CERTS must keep working despite the explicit ca array
const f = await runClient({ GAME_ASSETS_API_URL: base, GAME_ASSETS_CA_FILE: "", NODE_EXTRA_CA_CERTS: benchCa });
record("F: NODE_EXTRA_CA_CERTS respected", f.status === "ok" && f.remote?.status === "ok", f.remote?.status);

server.close();
rmSync(work, { recursive: true, force: true });

const failed = results.filter((entry) => !entry.pass);
console.log(failed.length ? `\n${failed.length} scenario(s) failed` : "\nAll scenarios passed");
process.exit(failed.length ? 1 : 0);
