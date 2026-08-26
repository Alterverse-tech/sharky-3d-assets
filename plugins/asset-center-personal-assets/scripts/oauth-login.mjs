// Asset Center OAuth 2.1: discovery → dynamic registration → browser authorization
// → loopback callback → token exchange → local credential cache → silent refresh.

import { createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const CREDENTIALS_DIR = path.join(homedir(), ".sharky-asset-center");
const CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, "credentials.json");
// Match the server-side authorization request TTL: email-code sign-in can take several minutes.
const LOGIN_TIMEOUT_MS = 10 * 60_000;
const ACCESS_TOKEN_SKEW_MS = 60_000;
const OAUTH_SCOPE = "openid profile email assets.read offline_access";
const interactiveSessions = new Map();

export class OAuthAuthorizationRequiredError extends Error {
  constructor(authorizationUrl, browserOpened) {
    super("Asset Center authorization is required");
    this.name = "OAuthAuthorizationRequiredError";
    this.authorizationUrl = authorizationUrl;
    this.browserOpened = browserOpened;
  }
}

function log(message) {
  process.stderr.write(`[asset-center-oauth] ${message}\n`);
}

function base64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

async function readCredentialsFile() {
  try {
    const parsed = JSON.parse(await fs.readFile(CREDENTIALS_PATH, "utf8"));
    return parsed && typeof parsed === "object" && parsed.version === 1 && parsed.issuers && typeof parsed.issuers === "object"
      ? parsed
      : { version: 1, issuers: {} };
  } catch {
    return { version: 1, issuers: {} };
  }
}

async function writeCredentialsFile(store) {
  await fs.mkdir(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
  const temporaryPath = `${CREDENTIALS_PATH}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporaryPath, CREDENTIALS_PATH);
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }
  return { response, payload };
}

async function discoverMetadata(issuerOrigin) {
  const { response, payload } = await fetchJson(`${issuerOrigin}/.well-known/oauth-authorization-server`);
  if (!response.ok || typeof payload.authorization_endpoint !== "string" || typeof payload.token_endpoint !== "string") {
    throw new Error(`Asset Center authorization server metadata is unavailable (HTTP ${response.status}). Ensure OAuth support is deployed.`);
  }
  return payload;
}

async function registerClient(metadata, redirectUri) {
  const { response, payload } = await fetchJson(metadata.registration_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "asset-center-personal-assets MCP",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: OAUTH_SCOPE
    })
  });
  if (!response.ok || typeof payload.client_id !== "string") {
    throw new Error(`OAuth client registration failed: ${payload.error_description ?? payload.error ?? `HTTP ${response.status}`}`);
  }
  return payload.client_id;
}

function waitForCallback(server, callbackPath, expectedState) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Browser authorization timed out after ${Math.round(LOGIN_TIMEOUT_MS / 60_000)} minutes. Try again and complete sign-in in the opened page.`));
    }, LOGIN_TIMEOUT_MS);
    server.on("request", (request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== callbackPath) {
        response.statusCode = 404;
        response.end("Not found");
        return;
      }
      const finish = (title, body) => {
        response.statusCode = 200;
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      body { display: grid; min-height: 100vh; min-height: 100svh; margin: 0; padding: 24px; place-items: center; background: #fff; color: #171717; }
      main { width: min(100%, 430px); padding: 36px 34px; border: 1px solid rgba(23, 23, 23, 0.13); border-radius: 22px; background: #fff; box-shadow: 0 18px 44px rgba(23, 23, 23, 0.08); text-align: center; }
      .success-mark { display: grid; width: 48px; height: 48px; margin: 0 auto 18px; place-items: center; }
      h1 { margin: 0; font-size: 28px; letter-spacing: -0.04em; line-height: 1.15; }
      p { max-width: 350px; margin: 15px auto 0; color: #666661; font-size: 15px; line-height: 1.55; }
      @media (max-width: 480px) { body { padding: 16px; } main { padding: 34px 24px; border-radius: 18px; } }
    </style>
  </head>
  <body>
    <main>
      <div class="success-mark" aria-hidden="true"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#15803D" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3v8Z"/><path d="m9 12 2 2 4-4"/></svg></div>
      <h1>${title}</h1>
      <p>${body}</p>
    </main>
  </body>
</html>`);
      };
      const error = url.searchParams.get("error");
      if (error) {
        finish("Authorization declined", "You can close this page and return to your terminal.");
        clearTimeout(timer);
        reject(new Error(`Authorization declined: ${error}`));
        return;
      }
      const code = url.searchParams.get("code") ?? "";
      const state = url.searchParams.get("state") ?? "";
      if (!code || state !== expectedState) {
        finish("Invalid authorization response", "State validation failed. Return to your terminal and try again.");
        clearTimeout(timer);
        reject(new Error("Authorization callback state validation failed"));
        return;
      }
      finish("Authorization successful", "Sign-in is complete. You can now close this page and return to Codex or Claude Code.");
      clearTimeout(timer);
      resolve(code);
    });
  });
}

function openBrowser(url) {
  // Headless and remote sessions may not have a browser; the caller still returns the URL.
  if (process.env.ASSET_CENTER_OAUTH_NO_BROWSER === "1") return Promise.resolve(false);
  const platform = process.platform;
  const command = platform === "darwin" ? "/usr/bin/open" : platform === "win32" ? "cmd.exe" : "xdg-open";
  const args = platform === "darwin" ? ["-u", url] : platform === "win32" ? ["/d", "/s", "/c", "start", "", url] : [url];
  return new Promise((resolve) => {
    let settled = false;
    const finish = (opened) => {
      if (settled) return;
      settled = true;
      resolve(opened);
    };
    try {
      // Keep macOS `open` attached until LaunchServices accepts the request. Without
      // `-g` it asks the default browser to come to the foreground.
      const child = spawn(command, args, { stdio: "ignore", detached: false, shell: false });
      const timer = setTimeout(() => finish(true), 4_000);
      child.once("error", () => {
        clearTimeout(timer);
        log(`Could not open a browser automatically. Open this URL manually: ${url}`);
        finish(false);
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        if (code !== 0) log(`Could not open a browser automatically. Open this URL manually: ${url}`);
        finish(code === 0);
      });
    } catch {
      log(`Could not open a browser automatically. Open this URL manually: ${url}`);
      finish(false);
    }
  });
}

async function exchangeToken(metadata, form) {
  const { response, payload } = await fetchJson(metadata.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString()
  });
  if (!response.ok || typeof payload.access_token !== "string") {
    const description = payload.error_description ?? payload.error ?? `HTTP ${response.status}`;
    const error = new Error(`Token exchange failed: ${description}`);
    error.oauthError = payload.error;
    throw error;
  }
  return payload;
}

async function persistTokens(issuerOrigin, clientId, tokens, previous) {
  const store = await readCredentialsFile();
  store.issuers[issuerOrigin] = {
    clientId,
    accessToken: tokens.access_token,
    expiresAt: Date.now() + Math.max(60, Number(tokens.expires_in) || 3600) * 1000,
    refreshToken: typeof tokens.refresh_token === "string" ? tokens.refresh_token : previous?.refreshToken,
    scope: typeof tokens.scope === "string" ? tokens.scope : OAUTH_SCOPE,
    updatedAt: new Date().toISOString()
  };
  await writeCredentialsFile(store);
  return store.issuers[issuerOrigin];
}

async function createInteractiveSession(issuerOrigin) {
  const metadata = await discoverMetadata(issuerOrigin);
  const callbackPath = `/callback/${base64Url(randomBytes(12))}`;
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(undefined));
  });
  try {
    const address = server.address();
    const redirectUri = `http://127.0.0.1:${address.port}${callbackPath}`;
    const clientId = await registerClient(metadata, redirectUri);
    const verifier = base64Url(randomBytes(48));
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const state = base64Url(randomBytes(16));
    const authorizeUrl = new URL(metadata.authorization_endpoint);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", challenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("scope", OAUTH_SCOPE);
    authorizeUrl.searchParams.set("resource", `${issuerOrigin}/codex/v1`);

    log("Starting Asset Center sign-in. If an authorization page opens, complete the confirmation there.");
    log(`Official authorization link (this sign-in only): ${authorizeUrl.toString()}`);
    log(`Waiting for the callback on ${redirectUri}. Sign in and press Allow access; the browser returns here automatically.`);
    const callback = waitForCallback(server, callbackPath, state);
    const completion = (async () => {
      try {
        const code = await callback;
        const tokens = await exchangeToken(metadata, {
          grant_type: "authorization_code",
          code,
          code_verifier: verifier,
          client_id: clientId,
          redirect_uri: redirectUri
        });
        const saved = await persistTokens(issuerOrigin, clientId, tokens);
        log("Authorization complete. Credentials are stored locally for the current user only.");
        return saved;
      } finally {
        server.close();
      }
    })();
    // The first tool call returns before the user approves. Keep the background
    // rejection handled while allowing later callers to await the same promise.
    void completion.catch((error) => log(`Authorization did not complete: ${error?.message ?? error}`));
    const browserOpened = await openBrowser(authorizeUrl.toString());
    return {
      authorizationUrl: authorizeUrl.toString(),
      browserOpened,
      completion
    };
  } catch (error) {
    server.close();
    throw error;
  }
}

async function beginInteractiveLogin(issuerOrigin) {
  let pending = interactiveSessions.get(issuerOrigin);
  if (!pending) {
    pending = createInteractiveSession(issuerOrigin);
    interactiveSessions.set(issuerOrigin, pending);
    void pending.then(
      (session) => session.completion.finally(() => {
        if (interactiveSessions.get(issuerOrigin) === pending) interactiveSessions.delete(issuerOrigin);
      }),
      () => {
        if (interactiveSessions.get(issuerOrigin) === pending) interactiveSessions.delete(issuerOrigin);
      }
    ).catch(() => undefined);
  }
  return pending;
}

async function refreshTokens(issuerOrigin, record) {
  const metadata = await discoverMetadata(issuerOrigin);
  const tokens = await exchangeToken(metadata, {
    grant_type: "refresh_token",
    refresh_token: record.refreshToken,
    client_id: record.clientId
  });
  return persistTokens(issuerOrigin, record.clientId, tokens, record);
}

/** Obtain an access token from the cache, refresh token, or interactive sign-in. */
export async function ensureOAuthAccessToken(issuerOrigin, options = {}) {
  const normalizedOrigin = issuerOrigin.replace(/\/+$/, "");
  const store = await readCredentialsFile();
  const record = store.issuers[normalizedOrigin];
  if (!options.forceRefresh && record?.accessToken && record.expiresAt - ACCESS_TOKEN_SKEW_MS > Date.now()) {
    return record.accessToken;
  }
  if (record?.refreshToken && record.clientId) {
    try {
      const refreshed = await refreshTokens(normalizedOrigin, record);
      return refreshed.accessToken;
    } catch (error) {
      log(`Cached refresh token is invalid (${error?.message ?? error}). Signing in again.`);
    }
  }
  if (options.nonInteractive) {
    throw new Error("Asset Center requires browser sign-in, but this request is non-interactive. Run an asset operation once to complete browser sign-in.");
  }
  const session = await beginInteractiveLogin(normalizedOrigin);
  if (options.returnPendingAuthorization) {
    throw new OAuthAuthorizationRequiredError(session.authorizationUrl, session.browserOpened);
  }
  const saved = await session.completion;
  return saved.accessToken;
}

/** Clear locally cached credentials for sign-out or credential recovery. */
export async function clearOAuthTokens(issuerOrigin) {
  const normalizedOrigin = issuerOrigin.replace(/\/+$/, "");
  const store = await readCredentialsFile();
  if (store.issuers[normalizedOrigin]) {
    delete store.issuers[normalizedOrigin];
    await writeCredentialsFile(store);
  }
}
