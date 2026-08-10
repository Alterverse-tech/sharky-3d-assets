// oauth-login.mjs — Asset Center OAuth 2.1 登录(零依赖,授权码 + PKCE + 回环回调)
// 复刻 ChatCut MCP 授权模型: 发现(RFC 8414) → 匿名动态注册(RFC 7591) → 浏览器授权(S256)
// → 127.0.0.1 随机端口回调 → 令牌换发 → 本地 0600 缓存 → refresh_token 静默续期。
// 令牌只落在用户本机 ~/.sharky-asset-center/credentials.json,不经任何第三方。

import { createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const CREDENTIALS_DIR = path.join(homedir(), ".sharky-asset-center");
const CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, "credentials.json");
// 与服务端待授权请求 TTL 对齐(10 分钟): 邮箱验证码登录需要收信+输码,5 分钟偏紧
const LOGIN_TIMEOUT_MS = 10 * 60_000;
const ACCESS_TOKEN_SKEW_MS = 60_000;
const OAUTH_SCOPE = "openid profile email assets.read offline_access";

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
    throw new Error(`Asset Center 授权服务器元数据不可用(HTTP ${response.status}); 请确认服务端已部署 OAuth 支持`);
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
    throw new Error(`OAuth 客户端注册失败: ${payload.error_description ?? payload.error ?? `HTTP ${response.status}`}`);
  }
  return payload.client_id;
}

function waitForCallback(server, callbackPath, expectedState) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`等待浏览器授权超时(${Math.round(LOGIN_TIMEOUT_MS / 60_000)}分钟)。请重试并在打开的页面中完成登录。`));
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
        response.end(`<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#11141b;color:#e8ecf4"><div style="text-align:center"><h2>${title}</h2><p>${body}</p></div>`);
      };
      const error = url.searchParams.get("error");
      if (error) {
        finish("授权被拒绝", "你可以关闭此页面,回到终端。");
        clearTimeout(timer);
        reject(new Error(`授权被拒绝: ${error}`));
        return;
      }
      const code = url.searchParams.get("code") ?? "";
      const state = url.searchParams.get("state") ?? "";
      if (!code || state !== expectedState) {
        finish("授权参数无效", "state 校验失败,请回到终端重试。");
        clearTimeout(timer);
        reject(new Error("授权回调 state 校验失败"));
        return;
      }
      finish("Asset Center 授权成功", "登录完成,现在可以关闭此页面回到你的 agent。");
      clearTimeout(timer);
      resolve(code);
    });
  });
}

function openBrowser(url) {
  // 无头/远程会话(SSH、容器、CI)没有可用浏览器: 只打印链接,用户可在本机手动打开
  if (process.env.ASSET_CENTER_OAUTH_NO_BROWSER === "1") return false;
  const platform = process.platform;
  const command = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.on("error", () => log(`无法自动打开浏览器,请手动访问: ${url}`));
    child.unref();
    return true;
  } catch {
    log(`无法自动打开浏览器,请手动访问: ${url}`);
    return false;
  }
}

async function exchangeToken(metadata, form) {
  const { response, payload } = await fetchJson(metadata.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString()
  });
  if (!response.ok || typeof payload.access_token !== "string") {
    const description = payload.error_description ?? payload.error ?? `HTTP ${response.status}`;
    const error = new Error(`令牌换发失败: ${description}`);
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

async function interactiveLogin(issuerOrigin) {
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

    log(`正在打开浏览器完成 Asset Center 登录授权…`);
    log(`如果页面没有自动弹出,请手动打开: ${authorizeUrl.toString()}`);
    openBrowser(authorizeUrl.toString());

    const code = await waitForCallback(server, callbackPath, state);
    const tokens = await exchangeToken(metadata, {
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: clientId,
      redirect_uri: redirectUri
    });
    const saved = await persistTokens(issuerOrigin, clientId, tokens);
    log("授权完成,令牌已保存到本机(仅当前用户可读)。");
    return saved;
  } finally {
    server.close();
  }
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

/** 获取有效访问令牌: 缓存 → 刷新 → 交互式登录 */
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
      log(`刷新令牌失效(${error?.message ?? error}),需要重新登录。`);
    }
  }
  if (options.nonInteractive) {
    throw new Error("Asset Center 需要登录授权,但当前为非交互模式。请先运行一次需要资产的操作完成浏览器登录。");
  }
  const saved = await interactiveLogin(normalizedOrigin);
  return saved.accessToken;
}

/** 清除本机缓存令牌(登出/失效处理) */
export async function clearOAuthTokens(issuerOrigin) {
  const normalizedOrigin = issuerOrigin.replace(/\/+$/, "");
  const store = await readCredentialsFile();
  if (store.issuers[normalizedOrigin]) {
    delete store.issuers[normalizedOrigin];
    await writeCredentialsFile(store);
  }
}
