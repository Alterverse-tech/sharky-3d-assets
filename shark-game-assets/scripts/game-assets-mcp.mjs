#!/usr/bin/env node
// Thin MCP client: speaks MCP (JSON-RPC over stdio) to the host CLI, and plain HTTPS
// to the remote asset-generation API. No local repo dependency, no API keys on the user machine.
import { mkdir, readFile, writeFile, access, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import tls from "node:tls";
import { fileURLToPath } from "node:url";
import { stripClipGlb, extractGlbMeta } from "./glb-tools.mjs";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "game_assets", version: "0.4.0" };

const DEFAULT_API_BASE = "https://studio.13-216-49-19.sslip.io";
const API_BASE = (process.env.GAME_ASSETS_API_URL || DEFAULT_API_BASE).replace(/\/$/, "");

// The default endpoint's Let's Encrypt chain (newer ISRG hierarchy) fails path
// building against Node's compiled-in root store, so a bundled anchor is
// appended to — never substituted for — the default roots. Certificate
// verification itself is never relaxed.
const BUNDLED_CA_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "certs", "asset-service-ca.pem");
let extraCaFile = process.env.GAME_ASSETS_CA_FILE || "";
let cachedHttpsAgent;

function getHttpsAgent() {
  if (!cachedHttpsAgent) {
    const anchors = [];
    const explicit = extraCaFile.trim();
    if (explicit) {
      try {
        anchors.push(readFileSync(explicit, "utf8"));
      } catch (error) {
        throw new Error(`Cannot read CA file ${explicit}: ${error.message}`);
      }
    }
    try {
      anchors.push(readFileSync(BUNDLED_CA_FILE, "utf8"));
    } catch {
      process.stderr.write(`[game-assets] Bundled CA anchor ${BUNDLED_CA_FILE} could not be read; continuing with default trust only.\n`);
    }
    cachedHttpsAgent = new https.Agent({ keepAlive: true, ca: [...defaultCaCertificates(), ...anchors] });
  }
  return cachedHttpsAgent;
}

// An explicit `ca` array bypasses Node's implicit NODE_EXTRA_CA_CERTS handling,
// so the default set must be rebuilt to include it, not just tls.rootCertificates.
function defaultCaCertificates() {
  try {
    return tls.getCACertificates("default");
  } catch {
    const roots = [...tls.rootCertificates];
    if (process.env.NODE_EXTRA_CA_CERTS) {
      try {
        roots.push(readFileSync(process.env.NODE_EXTRA_CA_CERTS, "utf8"));
      } catch {
        // Node itself already warns about an unreadable NODE_EXTRA_CA_CERTS.
      }
    }
    return roots;
  }
}

const POLL_INTERVAL_MS = 3000;
const GENERATE_TIMEOUT_MS = 840000;
const HTTP_TIMEOUT_MS = 60000;

const VALID_ROLES = ["player", "collectible", "hazard", "prop", "vehicle", "environment"];
const VALID_KINDS = ["character", "creature", "prop", "vehicle", "environment"];
const ROUTES = ["auto", "tripo", "gemini_reference"];
// Bundled snapshot of the Tripo retarget preset library, grouped by rig model
// and rig type. The catalog — not a hardcoded whitelist — decides which presets
// the animate command accepts; the default clip set stays walk-only.
const PRESET_CATALOG_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "preset-catalog.json");
const FALLBACK_RIG_CLIPS = ["preset:biped:idle", "preset:biped:walk", "preset:biped:run", "preset:biped:jump"];
const PRESET_CATALOG = loadPresetCatalog();
const RIG_CLIP_PRESET_ENUM = PRESET_CATALOG
  ? [...new Set(Object.values(PRESET_CATALOG.rigModels).flatMap((model) => Object.values(model.rigTypes).flat()))]
  : FALLBACK_RIG_CLIPS;
const DEFAULT_BIPED_RIG_CLIPS = ["preset:biped:walk"];
const DEFAULT_RIG_MODEL_VERSION = "v1.0-20240301";

function loadPresetCatalog() {
  try {
    return JSON.parse(readFileSync(PRESET_CATALOG_FILE, "utf8"));
  } catch (error) {
    process.stderr.write(`[game-assets] preset-catalog.json could not be read (${error.message}); falling back to the core preset set.\n`);
    return null;
  }
}

function rigClipPresetsFor(modelVersion) {
  const rigTypes = PRESET_CATALOG?.rigModels?.[modelVersion]?.rigTypes;
  if (!rigTypes) return new Set(FALLBACK_RIG_CLIPS);
  return new Set(Object.values(rigTypes).flat());
}
const ASSET_PROMPT_RULE =
  'Write concise English asset prompts describing the subject, identity-defining shape, proportions, materials, colors, and gameplay role. Preserve the visual style from the user or game specification. Do not add "simple", "low-poly", "stylized", or "cartoon" unless that style was requested. Favor a single fully visible subject, readable silhouette, clean separation of major forms, and no background, text, logo, watermark, unrelated props, duplicate parts, or extra characters.';

const TOOL_DEFINITIONS = [
  {
    name: "check_game_asset_generation_readiness",
    description:
      "Check whether the current project can generate 3D game assets. Pass cwd as the absolute current project directory. Reports output paths and route availability without exposing provider credentials or account details.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        cwd: {
          type: "string",
          description: "Absolute path to the current project directory. Run pwd and pass that value."
        }
      }
    }
  },
  {
    name: "generate_game_assets_batch",
    description:
      "Generate 1-4 game-ready GLB assets for a 3D game, cache them into cwd/public/generated-assets, and write cwd/asset_manifest.json. This may consume Tripo and optionally Gemini credits. On the gemini_reference route, character/creature assets are automatically rigged after image-to-model. Retarget success returns separate animationClips GLBs; retarget failure can return main-GLB fallback animations with animationSource=procedural_native_clips. If the server rigs animation clips, each Tripo retarget preset is generated as a separate GLB; do not request batched retarget presets.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        cwd: {
          type: "string",
          description: "Absolute path to the current project directory. Run pwd and pass that value so assets are written to the correct repo."
        },
        gamePrompt: { type: "string" },
        route: {
          type: "string",
          enum: ROUTES,
          description: "Use tripo for fast text-to-model, gemini_reference for Gemini white-background reference image then Tripo image-to-model, or auto."
        },
        force: {
          type: "boolean",
          description: "Regenerate even if asset_manifest.json already has assets. Use only when the user explicitly asks to regenerate."
        },
        assets: {
          type: "array",
          minItems: 1,
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              role: { type: "string", enum: VALID_ROLES },
              name: { type: "string" },
              prompt: { type: "string", description: ASSET_PROMPT_RULE },
              assetKind: {
                type: "string",
                enum: VALID_KINDS,
                description: "Required for gemini_reference. character/creature gets T-pose; prop/vehicle/environment gets isolated object reference."
              },
              animated: {
                type: "boolean",
                description: "Set true only for one living main character if rigging is enabled on the server."
              },
              animations: {
                type: "array",
                maxItems: 5,
                items: { type: "string" },
                description:
                  "Confirmed Tripo retarget presets for this character/creature (max 5), from scripts/preset-catalog.json and the user-confirmed action requirements list. Omit for the default walk-only rig. Ignored on the tripo route."
              }
            },
            required: ["id", "role", "name", "prompt"]
          }
        }
      },
      required: ["cwd", "gamePrompt", "assets"]
    }
  },
  {
    name: "generate_tripo_rig_clips",
    description:
      "Animate an existing Tripo GLB task into rigged biped GLB clips. Uses Tripo rig v1.0-20240301 by default and never sends multiple retarget presets in one request. Defaults to walk only; any other preset from scripts/preset-catalog.json requires explicit selection backed by a user-confirmed action requirements list. If retarget fails after rigging, the API may embed a procedural Walk clip in the main GLB; idle is runtime procedural motion.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        cwd: {
          type: "string",
          description: "Absolute path to the current project directory. Generated GLBs and asset_manifest.json are written here."
        },
        originalModelTaskId: {
          type: "string",
          description: "Tripo task id of the existing source GLB/model to rig and retarget."
        },
        assetId: {
          type: "string",
          description: "Stable kebab-case id for the manifest entry and local filenames."
        },
        assetName: {
          type: "string",
          description: "Human-readable manifest name."
        },
        role: {
          type: "string",
          enum: VALID_ROLES,
          description: "Manifest role. Defaults to player."
        },
        animations: {
          type: "array",
          items: { type: "string", enum: RIG_CLIP_PRESET_ENUM },
          description:
            "Optional presets from scripts/preset-catalog.json, for example preset:biped:climb or preset:biped:run_upstairs. Omit to generate walk only. If multiple presets are provided, this client splits them into separate /animate calls."
        },
        spec: {
          type: "string",
          enum: ["tripo", "mixamo"],
          description: "Rig naming spec. Defaults to tripo for Tripo preset retarget stability; use mixamo only when explicitly needed."
        },
        modelVersion: {
          type: "string",
          description: "Tripo rig model version. Defaults to v1.0-20240301 for biped compatibility."
        }
      },
      required: ["cwd", "originalModelTaskId", "assetId"]
    }
  }
];

// CLI mode: `node game-assets-mcp.mjs readiness --cwd <dir>` or
// `node game-assets-mcp.mjs generate --cwd <dir> --params '<json>'` or
// `node game-assets-mcp.mjs animate --cwd <dir> --params '<json>'`.
// Optional on every command: `--ca-file <pem>` (or GAME_ASSETS_CA_FILE) to
// append extra trust anchors; defaults to the bundled certs/asset-service-ca.pem.
// Lets skill-only installs (npx skills add) drive the client via Bash without MCP registration.
const cliCommand = process.argv[2];
if (cliCommand === "readiness" || cliCommand === "generate" || cliCommand === "animate") {
  runCli(cliCommand, process.argv.slice(3))
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      process.exit(result && result.status === "failed" ? 1 : 0);
    })
    .catch((error) => {
      process.stdout.write(`${JSON.stringify({ status: "failed", errors: [publicErrorMessage(error)] }, null, 2)}\n`);
      process.exit(1);
    });
} else {
  startMcpServer();
}

async function runCli(command, argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--cwd") flags.cwd = argv[++i];
    else if (argv[i] === "--params") flags.params = argv[++i];
    else if (argv[i] === "--ca-file") flags.caFile = argv[++i];
  }
  if (flags.caFile) extraCaFile = flags.caFile;
  if (command === "readiness") return checkReadiness({ cwd: flags.cwd });
  let params;
  try {
    params = JSON.parse(flags.params || "{}");
  } catch {
    throw new Error("--params must be a JSON object, e.g. --params '{\"gamePrompt\":\"...\",\"assets\":[...]}'");
  }
  if (command === "animate") return generateRigClips({ ...params, cwd: flags.cwd ?? params.cwd });
  return generateAssets({ ...params, cwd: flags.cwd ?? params.cwd });
}

let inputBuffer = "";
function startMcpServer() {
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    inputBuffer += chunk;
    processInputBuffer();
  });
  process.stdin.on("end", () => process.exit(0));
}

function processInputBuffer() {
  while (true) {
    const parsed = readJsonRpcMessage(inputBuffer);
    if (!parsed) return;
    inputBuffer = inputBuffer.slice(parsed.bytesRead);
    handleMessage(parsed.message).catch((error) => {
      if (parsed.message && Object.prototype.hasOwnProperty.call(parsed.message, "id")) {
        writeError(parsed.message.id, -32000, publicErrorMessage(error));
      }
    });
  }
}

async function handleMessage(message) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") return;
  if (message.method === "initialize") {
    writeResult(message.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
      instructions:
        "Use this server only for key GLB assets in 3D games. Pass cwd as the current project directory. Generate 1-5 essential assets, reuse asset_manifest.json by default, and keep primitive fallbacks. The gemini_reference route automatically rigs character/creature GLBs; retarget success returns separate animationClips and retarget failure may return main-GLB procedural_native_clips. For existing-GLB animation, Tripo retarget must be one preset per request; the default biped clip is walk only, any other catalog preset is an explicit option gated by a user-confirmed action requirements list, and each successful retarget clip should be recorded as a separate animationClips GLB. Runtime idle belongs on the character visual child, not in the default GLB."
    });
    return;
  }
  if (message.method === "notifications/initialized") return;
  if (message.method === "ping") {
    writeResult(message.id, {});
    return;
  }
  if (message.method === "tools/list") {
    writeResult(message.id, { tools: TOOL_DEFINITIONS });
    return;
  }
  if (message.method === "tools/call") {
    await handleToolCall(message);
    return;
  }
  writeError(message.id, -32601, `Method not found: ${message.method}`);
}

async function handleToolCall(message) {
  const params = message.params || {};
  const name = params.name;
  const args = params.arguments && typeof params.arguments === "object" ? params.arguments : {};
  if (name === "check_game_asset_generation_readiness") {
    const result = await checkReadiness(args);
    writeToolResult(message.id, result);
    return;
  }
  if (name === "generate_game_assets_batch") {
    const result = await generateAssets(args);
    writeToolResult(message.id, result, result.status === "failed");
    return;
  }
  if (name === "generate_tripo_rig_clips") {
    const result = await generateRigClips(args);
    writeToolResult(message.id, result, result.status === "failed");
    return;
  }
  writeError(message.id, -32602, `Unknown tool: ${name}`);
}

async function checkReadiness(args) {
  const workspace = resolveWorkspace(args.cwd);
  const output = outputPaths(workspace);

  const workspaceWritable = await isWritableDirectory(workspace);
  let remote;
  try {
    remote = publicReadiness(await apiRequest("GET", "/api/asset-jobs/readiness"));
  } catch (error) {
    remote = { status: "unreachable", message: publicErrorMessage(error) };
  }

  const status = remote.status === "ok" && workspaceWritable ? "ok" : "needs_setup";
  return {
    status,
    workspace,
    output,
    api: { baseUrl: API_BASE, access: "public" },
    remote,
    workspaceWritable,
    message: readinessMessage(remote, workspaceWritable)
  };
}

async function generateAssets(args) {
  const workspace = resolveWorkspace(args.cwd);
  const route = selectRoute(args.route, args);
  const output = outputPaths(workspace);
  const assets = normalizeAssets(args.assets, route);
  if (assets.length === 0) {
    return {
      status: "failed",
      route,
      workspace,
      errors: ["generate_game_assets_batch requires at least one valid asset."]
    };
  }

  const existing = await readExistingManifest(output.manifestFile);
  const reusable = args.force === true ? [] : await findReusableAssetIds(existing, assets, workspace);
  const requested = assets.filter((asset) => !reusable.includes(asset.id));
  if (requested.length === 0) {
    const publicManifest = sanitizeProviderFields(existing);
    return {
      status: "skipped",
      route,
      workspace,
      output,
      manifest: publicManifest,
      reusedAssetIds: reusable,
      skippedReason: "Every requested asset id already has a loadable local GLB.",
      message: `Reused ${reusable.length} requested asset(s) from ${output.manifestFile}.`
    };
  }

  let effectiveRoute = route;
  let fallback;
  let job;
  try {
    job = await createAndPollAssetJob(args, requested, route, output);
  } catch (error) {
    if (route !== "gemini_reference" || !isGeminiFallbackError(error)) throw error;
    fallback = { from: route, to: "tripo", reason: "reference_image_service_unavailable" };
  }
  if (!fallback && route === "gemini_reference" && job?.status === "failed" && !hasLoadableAsset(job) && isGeminiFallbackError(collectJobErrors(job).join(" "))) {
    fallback = { from: route, to: "tripo", reason: "reference_image_service_unavailable" };
  }
  if (fallback) {
    effectiveRoute = "tripo";
    reportCliProgress("Reference-image route unavailable; retrying once with Tripo.");
    job = await createAndPollAssetJob(args, normalizeAssets(requested, effectiveRoute), effectiveRoute, output);
  }

  if (job.status === "failed" && !hasLoadableAsset(job)) {
    const errors = collectJobErrors(job);
    return {
      status: "failed",
      route: effectiveRoute,
      workspace,
      output,
      ...(fallback ? { fallback } : {}),
      errors,
      message: `${effectiveRoute} generation failed: ${errors.join("; ") || "Asset generation failed."}`
    };
  }

  reportCliProgress("Downloading completed GLB assets.");
  const downloaded = await downloadJobAssets(job, output);
  const generatedManifest = buildLocalManifest(job, downloaded);
  const manifest = await enrichManifestMetadata(
    mergeManifests(existing, generatedManifest, args.force === true ? requested.map((asset) => asset.id) : downloaded.map((asset) => asset.id), effectiveRoute),
    workspace
  );
  await mkdir(path.dirname(output.manifestFile), { recursive: true });
  await writeFile(output.manifestFile, JSON.stringify(manifest, null, 2));
  await writeProgressFile(output.progressFile, job);

  return {
    status: job.status,
    route: effectiveRoute,
    workspace,
    output,
    ...(fallback ? { fallback } : {}),
    ...(reusable.length ? { reusedAssetIds: reusable } : {}),
    assets: downloaded,
    manifest,
    errors: collectJobErrors(job),
    message: summarizeGenerationResult(effectiveRoute, job, downloaded, output)
  };
}

async function createAndPollAssetJob(args, assets, route, output) {
  const created = await apiRequest("POST", "/api/asset-jobs", {
    gamePrompt: typeof args.gamePrompt === "string" ? args.gamePrompt : "",
    route,
    force: args.force === true,
    assets
  });
  if (!created.jobId) throw new Error("Asset job creation did not return a job id.");
  reportCliProgress(`Submitted ${assets.length} asset(s) through ${route}.`);
  return pollJobUntilDone(created.jobId, output);
}

async function generateRigClips(args) {
  const workspace = resolveWorkspace(args.cwd);
  const output = outputPaths(workspace);
  const originalModelTaskId = typeof args.originalModelTaskId === "string" ? args.originalModelTaskId.trim() : "";
  if (!/^[a-zA-Z0-9_-]{8,}$/.test(originalModelTaskId)) {
    return { status: "failed", workspace, output, errors: ["originalModelTaskId is required and must be a Tripo task id."] };
  }

  const assetId = safeId(args.assetId || originalModelTaskId);
  if (!assetId) return { status: "failed", workspace, output, errors: ["assetId is required."] };

  const role = VALID_ROLES.includes(args.role) ? args.role : "player";
  const assetName = typeof args.assetName === "string" && args.assetName.trim() ? args.assetName.trim() : assetId;
  const modelVersion = typeof args.modelVersion === "string" && args.modelVersion.trim() ? args.modelVersion.trim() : DEFAULT_RIG_MODEL_VERSION;
  const requestedAnimations = normalizeRigClipAnimations(args.animations, modelVersion);
  if (requestedAnimations === false) {
    return {
      status: "failed",
      workspace,
      output,
      errors: [
        `animations must contain only presets listed in preset-catalog.json for rig model ${modelVersion} (for example preset:biped:walk, preset:biped:climb, preset:biped:run_upstairs).`
      ]
    };
  }

  const callPlans = requestedAnimations
    ? requestedAnimations.map((preset) => ({ animations: [preset], preset }))
    : [{ animations: DEFAULT_BIPED_RIG_CLIPS, preset: DEFAULT_BIPED_RIG_CLIPS.join(",") }];

  const responses = [];
  for (const plan of callPlans) {
    const body = {
      originalModelTaskId,
      spec: args.spec === "tripo" || args.spec === "mixamo" ? args.spec : "tripo",
      modelVersion,
      ...(plan.animations ? { animations: plan.animations } : {})
    };
    responses.push(await apiRequest("POST", "/api/asset-jobs/animate", body));
  }

  await mkdir(output.assetRootDir, { recursive: true });
  const baseResponse = responses.find((result) => result.downloadUrl || result.modelUrl) || responses[0] || {};
  const baseFileName = `${assetId}-rigged.glb`;
  let baseLocalUrl;
  if (baseResponse.downloadUrl) {
    const baseLocalFile = path.join(output.assetRootDir, baseFileName);
    const bytes = await apiDownload(baseResponse.downloadUrl);
    await writeFile(baseLocalFile, bytes);
    baseLocalUrl = `${output.publicPath}/${baseFileName}`;
  }

  const clipMap = new Map();
  for (const response of responses) {
    const clips = Array.isArray(response.animationClips) ? response.animationClips : [];
    for (const clip of clips) {
      if (!clip.downloadUrl) continue;
      const name = safeId(clip.name || presetName(clip.preset) || "clip") || "clip";
      const key = clip.preset || name;
      const fileName = `${assetId}-${name}.glb`;
      const filePath = path.join(output.assetRootDir, fileName);
      const bytes = stripClipOrKeep(await apiDownload(clip.downloadUrl), fileName);
      await writeFile(filePath, bytes);
      clipMap.set(key, {
        name,
        preset: clip.preset,
        url: `${output.publicPath}/${fileName}`,
        format: "glb",
        bytes: bytes.byteLength
      });
    }
  }

  const manifest = await upsertRigClipManifest(output.manifestFile, workspace, {
    id: assetId,
    role,
    name: assetName,
    url: baseLocalUrl,
    format: "glb",
    rigged: baseResponse.status === "rigged" || Boolean(baseResponse.rigType),
    rigType: baseResponse.rigType,
    source: "tripo_rig_clip",
    ...(Array.isArray(baseResponse.animations) && baseResponse.animations.length ? { animations: baseResponse.animations } : {}),
    ...(baseResponse.animationSource ? { animationSource: baseResponse.animationSource } : {}),
    ...(baseResponse.retargetError ? { rigError: publicErrorMessage(baseResponse.retargetError) } : {}),
    animationClips: [...clipMap.values()].map(({ bytes, ...clip }) => clip)
  });

  const errors = responses.flatMap((response) => (response.retargetError ? [response.retargetError] : response.reason ? [response.reason] : [])).map(publicErrorMessage);
  const hasProceduralFallback = Array.isArray(baseResponse.animations) && baseResponse.animations.length > 0 && baseResponse.animationSource === "procedural_native_clips";
  return {
    status: errors.length > 0 && clipMap.size === 0 && !hasProceduralFallback ? "failed" : "success",
    workspace,
    output,
    asset: {
      id: assetId,
      role,
      name: assetName,
      localUrl: baseLocalUrl,
      rigType: baseResponse.rigType,
      ...(Array.isArray(baseResponse.animations) && baseResponse.animations.length ? { animations: baseResponse.animations } : {}),
      ...(baseResponse.animationSource ? { animationSource: baseResponse.animationSource } : {}),
      animationClips: [...clipMap.values()]
    },
    manifest,
    errors,
    message: `Generated ${clipMap.size} Tripo rig clip GLB(s) for ${assetId}. Manifest: ${output.manifestFile}`
  };
}

async function pollJobUntilDone(jobId, output) {
  const deadline = Date.now() + GENERATE_TIMEOUT_MS;
  let previousSummary = "";
  for (;;) {
    const job = await apiRequest("GET", `/api/asset-jobs/${encodeURIComponent(jobId)}`);
    await writeProgressFile(output.progressFile, job).catch(() => undefined);
    const summary = progressSummary(job);
    if (summary !== previousSummary) {
      reportCliProgress(summary);
      previousSummary = summary;
    }
    if (job.done) return job;
    if (Date.now() > deadline) {
      throw new Error(`Asset generation timed out after ${Math.round(GENERATE_TIMEOUT_MS / 1000)} seconds.`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

// Retarget-clip GLBs arrive with a full copy of the skinned mesh + textures
// that runtime code never reads (the clip binds to the base model's skeleton),
// so clips are stored animation-only. Fail-open: any parse problem ships the
// original bytes untouched.
function stripClipOrKeep(bytes, label) {
  try {
    const stripped = stripClipGlb(bytes);
    if (stripped.length < bytes.length) {
      reportCliProgress(`Stripped ${label} to animation-only GLB: ${Math.round(bytes.length / 1024)}KB -> ${Math.round(stripped.length / 1024)}KB.`);
      return stripped;
    }
    return bytes;
  } catch {
    return bytes;
  }
}

// Best-effort host-facing metadata (skeleton bone names, bind-pose bounds)
// parsed from the downloaded base GLBs; never blocks the manifest write.
async function enrichManifestMetadata(manifest, workspace) {
  for (const asset of manifest?.assets || []) {
    const runtimeUrl = asset.model?.url || asset.url;
    if (typeof runtimeUrl !== "string" || /^https?:\/\//i.test(runtimeUrl)) continue;
    const publicDir = path.resolve(workspace, "public");
    const file = path.resolve(publicDir, runtimeUrl.replace(/^\.\//, "").replace(/^public\//, "").replace(/^\/+/, ""));
    if (!file.startsWith(`${publicDir}${path.sep}`)) continue;
    try {
      const meta = extractGlbMeta(await readFile(file));
      if (meta.bones?.length) asset.rig = { ...(asset.rig || {}), bones: meta.bones };
      if (meta.geometry) asset.geometry = meta.geometry;
    } catch {
      // metadata only; the manifest stays valid without it
    }
  }
  return manifest;
}

async function downloadJobAssets(job, output) {
  const assets = Array.isArray(job.result?.assets) ? job.result.assets : [];
  await mkdir(output.assetRootDir, { recursive: true });
  const downloaded = [];
  for (const asset of assets) {
    const animationClips = await downloadAnimationClips(asset, output);
    const publicAsset = { id: asset.id, role: asset.role, name: asset.name, animationClips };
    if (!asset.downloadUrl) {
      downloaded.push({ ...publicAsset, error: publicErrorMessage(asset.error || "No downloadable GLB was returned.") });
      continue;
    }
    const fileName = `${asset.id}.glb`;
    const filePath = path.join(output.assetRootDir, fileName);
    try {
      const bytes = await apiDownload(asset.downloadUrl);
      await writeFile(filePath, bytes);
      downloaded.push({ ...publicAsset, localUrl: `${output.publicPath}/${fileName}`, bytes: bytes.byteLength });
    } catch (error) {
      downloaded.push({ ...publicAsset, error: `Download failed: ${publicErrorMessage(error)}` });
    }
  }
  return downloaded;
}

async function downloadAnimationClips(asset, output) {
  const clips = Array.isArray(asset.animationClips) ? asset.animationClips : [];
  const downloaded = [];
  for (const clip of clips) {
    const name = safeId(clip.name || clip.preset || "clip") || "clip";
    const fileName = `${asset.id}-${name}.glb`;
    const filePath = path.join(output.assetRootDir, fileName);
    if (!clip.downloadUrl) {
      downloaded.push({ name, preset: clip.preset, error: publicErrorMessage(clip.error || "No downloadable animation GLB was returned.") });
      continue;
    }
    try {
      const bytes = stripClipOrKeep(await apiDownload(clip.downloadUrl), fileName);
      await writeFile(filePath, bytes);
      downloaded.push({ name, preset: clip.preset, localUrl: `${output.publicPath}/${fileName}`, bytes: bytes.byteLength });
    } catch (error) {
      downloaded.push({ name, preset: clip.preset, error: `Download failed: ${publicErrorMessage(error)}` });
    }
  }
  return downloaded;
}

function buildLocalManifest(job, downloaded) {
  const remoteManifest = job.result?.manifest;
  const byId = new Map(downloaded.map((asset) => [asset.id, asset]));
  const entries = Array.isArray(remoteManifest?.assets) ? remoteManifest.assets : Array.isArray(job.result?.assets) ? job.result.assets : [];
  return {
    ...sanitizeProviderFields(remoteManifest || { version: 1, gamePrompt: job.gamePrompt || "", usage: "" }),
    assets: entries
      .map((entry) => {
        const local = byId.get(entry.id);
        if (!local || !local.localUrl) return undefined;
        const localClips = (local.animationClips || entry.animationClips || [])
          .map((clip) => (clip.localUrl ? { name: clip.name, preset: clip.preset, url: clip.localUrl, format: "glb" } : undefined))
          .filter(Boolean);
        const cleanEntry = sanitizeProviderFields(entry);
        const localActions = Object.fromEntries(
          Object.entries(cleanEntry.actions || {})
            .map(([name, action]) => {
              const clip = local.animationClips?.find((candidate) => candidate.name === name || candidate.preset?.endsWith(`:${name}`));
              return clip?.localUrl ? [name, { ...action, url: clip.localUrl }] : undefined;
            })
            .filter(Boolean)
        );
        return {
          ...cleanEntry,
          url: local.localUrl,
          ...(cleanEntry.model ? { model: { ...cleanEntry.model, url: local.localUrl } } : {}),
          ...(Object.keys(localActions).length ? { actions: localActions } : cleanEntry.actions ? { actions: {} } : {}),
          ...(localClips.length ? { animationClips: localClips } : {})
        };
      })
      .filter(Boolean)
  };
}

async function writeProgressFile(progressFile, job) {
  await mkdir(path.dirname(progressFile), { recursive: true });
  await writeFile(
    progressFile,
    JSON.stringify({ status: job.status, updatedAt: job.updatedAt, jobs: (job.progress || []).map(sanitizeProgressJob) }, null, 2)
  );
}

async function readExistingManifest(manifestFile) {
  try {
    return JSON.parse(await readFile(manifestFile, "utf8"));
  } catch {
    return undefined;
  }
}

async function findReusableAssetIds(manifest, requested, workspace) {
  const existing = Array.isArray(manifest?.assets) ? manifest.assets : [];
  const reusable = [];
  for (const asset of requested) {
    const entry = existing.find((candidate) => candidate?.id === asset.id);
    const runtimeUrl = entry?.model?.url || entry?.url;
    if (runtimeUrl && (await localRuntimeAssetExists(runtimeUrl, workspace))) reusable.push(asset.id);
  }
  return reusable;
}

async function localRuntimeAssetExists(runtimeUrl, workspace) {
  if (typeof runtimeUrl !== "string" || /^https?:\/\//i.test(runtimeUrl)) return false;
  const publicDir = path.resolve(workspace, "public");
  const relative = runtimeUrl.replace(/^\.\//, "").replace(/^public\//, "").replace(/^\/+/, "");
  const file = path.resolve(publicDir, relative);
  if (!file.startsWith(`${publicDir}${path.sep}`)) return false;
  try {
    const info = await stat(file);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

function mergeManifests(existing, generated, replaceIds, route) {
  if (!existing) return generated;
  const publicExisting = sanitizeProviderFields(existing);
  const replacing = new Set(replaceIds);
  const oldAssets = Array.isArray(publicExisting.assets) ? publicExisting.assets.filter((asset) => !replacing.has(asset?.id)) : [];
  const newAssets = Array.isArray(generated.assets) ? generated.assets : [];
  return {
    ...publicExisting,
    ...generated,
    route: existing.route && existing.route !== route ? "mixed" : generated.route || existing.route || route,
    bindings: { ...(existing.bindings || {}), ...(generated.bindings || {}) },
    assets: [...oldAssets, ...newAssets]
  };
}

async function upsertRigClipManifest(manifestFile, workspace, entry) {
  const existing = sanitizeProviderFields(await readExistingManifest(manifestFile));
  const assets = Array.isArray(existing?.assets) ? existing.assets.slice() : [];
  const index = assets.findIndex((asset) => asset && asset.id === entry.id);
  const previous = index >= 0 ? assets[index] : {};
  const previousClips = Array.isArray(previous.animationClips) ? previous.animationClips : [];
  const nextClips = mergeClipEntries(previousClips, entry.animationClips || []);
  const nextEntry = {
    ...previous,
    ...entry,
    url: entry.url || previous.url,
    ...(entry.animations || previous.animations ? { animations: entry.animations || previous.animations } : {}),
    ...(entry.animationSource || previous.animationSource ? { animationSource: entry.animationSource || previous.animationSource } : {}),
    ...(entry.rigError || previous.rigError ? { rigError: entry.rigError || previous.rigError } : {}),
    ...(nextClips.length ? { animationClips: nextClips } : {})
  };
  if (index >= 0) assets[index] = nextEntry;
  else assets.push(nextEntry);

  const manifest = {
    ...(existing || { version: 1, gamePrompt: "", usage: "" }),
    version: existing?.version || 1,
    assets,
    usage:
      existing?.usage ||
      "Load asset url with Three.js GLTFLoader. Load each animationClips url as a separate GLB and copy compatible AnimationClips onto the same rig. If animationSource is procedural_native_clips, play the main GLB's embedded animations directly."
  };
  await enrichManifestMetadata(manifest, workspace);
  await mkdir(path.dirname(manifestFile), { recursive: true });
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2));
  return manifest;
}

function mergeClipEntries(previousClips, newClips) {
  const byKey = new Map();
  for (const clip of previousClips) byKey.set(clip.preset || clip.name, clip);
  for (const clip of newClips) byKey.set(clip.preset || clip.name, clip);
  return [...byKey.values()];
}

function hasLoadableAsset(job) {
  return Array.isArray(job.result?.assets) && job.result.assets.some((asset) => asset.downloadUrl);
}

function collectJobErrors(job) {
  const errors = [];
  if (job.error) errors.push(job.error);
  if (Array.isArray(job.result?.errors)) errors.push(...job.result.errors);
  return errors.map(publicErrorMessage);
}

function sanitizeProgressJob(job) {
  return {
    id: job.id,
    label: job.label || job.name,
    status: job.status,
    progress: job.progress ?? job.modelProgress ?? 0,
    ...(job.error ? { error: publicErrorMessage(job.error) } : {}),
    ...(job.rig ? {
      rig: {
        status: job.rig.status,
        progress: job.rig.progress,
        animationClips: (job.rig.animationClips || []).map((clip) => ({
          name: clip.name,
          preset: clip.preset,
          status: clip.status,
          progress: clip.progress
        }))
      }
    } : {})
  };
}

function sanitizeProviderFields(value) {
  if (Array.isArray(value)) return value.map(sanitizeProviderFields);
  if (!value || typeof value !== "object") return value;
  const hidden = new Set(["downloadurl", "sourceurl", "modelurl", "taskid", "jobid", "originalmodeltaskid", "referenceimageurl"]);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !hidden.has(key.toLowerCase()))
      .map(([key, child]) => (/error|reason|message/i.test(key) && typeof child === "string" ? [key, publicErrorMessage(child)] : [key, sanitizeProviderFields(child)]))
  );
}

function publicErrorMessage(error) {
  let message = error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error || "Asset generation failed.");
  if (/gemini|reference.?image/i.test(message) && /401|unauthenticated|credential|access.?token|unsupported/i.test(message)) {
    return "Reference image generation is temporarily unavailable.";
  }
  if (/balance|insufficient|quota|credit/i.test(message)) return "Asset generation capacity is temporarily unavailable.";
  if (/timed?\s*out|abort/i.test(message)) return "Asset generation timed out.";
  message = message
    .replace(/https?:\/\/\S+/gi, "[remote URL]")
    .replace(/(?:task|job)[_\s-]*id\s*[:=]\s*[a-z0-9_-]+/gi, "remote job")
    .replace(/(api[_\s-]*key|access[_\s-]*token|authorization)\s*[:=]\s*\S+/gi, "$1=[redacted]");
  return message.slice(0, 240);
}

function isGeminiFallbackError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /gemini|reference.?image|white.?background|image.?generation/i.test(message) && /fail|error|401|unauthenticated|credential|access.?token|unsupported|unavailable/i.test(message);
}

function publicReadiness(remote) {
  const tripoUnavailable = remote?.keyStatus?.tripoApiKey === false || remote?.tripo?.available === false || remote?.tripo?.configured === false || remote?.routes?.tripo?.available === false;
  const geminiUnavailable = remote?.keyStatus?.geminiApiKey === false || remote?.geminiBudget?.geminiConfigured === false || remote?.gemini?.configured === false || remote?.routes?.gemini_reference?.available === false;
  return {
    status: remote?.status === "ok" ? "ok" : "needs_setup",
    routes: {
      tripo: tripoUnavailable ? "unavailable" : "ready",
      gemini_reference: geminiUnavailable ? "unavailable" : "configured_unverified"
    }
  };
}

function progressSummary(job) {
  const jobs = Array.isArray(job.progress) ? job.progress : [];
  const values = jobs.map((item) => Number(item.progress ?? item.modelProgress)).filter(Number.isFinite);
  const percent = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
  const completed = jobs.filter((item) => /success|ready|complete/i.test(item.status || "")).length;
  return `${job.status || "running"}: ${percent}%${jobs.length ? ` (${completed}/${jobs.length})` : ""}`;
}

function reportCliProgress(message) {
  if (cliCommand) process.stderr.write(`[game-assets] ${message}\n`);
}

async function apiRequest(method, apiPath, body) {
  const response = await fetchWithTimeout(`${API_BASE}${apiPath}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${method} ${apiPath} failed with HTTP ${response.status}: ${parsed.error || text.slice(0, 200)}`);
  }
  return parsed;
}

async function apiDownload(downloadPath) {
  const url = /^https?:\/\//i.test(downloadPath) ? downloadPath : `${API_BASE}${downloadPath}`;
  const response = await fetchWithTimeout(
    url,
    {},
    // GLB 文件可能几十 MB，下载超时独立于普通 API 请求。
    300000
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

// node:http(s) instead of global fetch: undici exposes no zero-dependency CA
// hook, and the appended-anchor agent above must apply to every remote call.
async function fetchWithTimeout(url, init = {}, timeoutMs = HTTP_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let currentUrl = url;
  let method = init.method || "GET";
  let body = init.body;
  let headers = init.headers || {};
  for (let hop = 0; hop < 6; hop++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`Request to ${url} timed out after ${Math.round(timeoutMs / 1000)}s`);
    const response = await requestOnce(currentUrl, { method, body, headers }, remaining, url, timeoutMs);
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.location) {
      const previousOrigin = new URL(currentUrl).origin;
      currentUrl = new URL(response.headers.location, currentUrl).toString();
      if (response.status !== 307 && response.status !== 308) {
        method = "GET";
        body = undefined;
        headers = {};
      } else if (new URL(currentUrl).origin !== previousOrigin) {
        // Match fetch semantics: credentials never follow a cross-origin redirect.
        headers = Object.fromEntries(
          Object.entries(headers).filter(([key]) => !/^(authorization|proxy-authorization|cookie)$/i.test(key))
        );
      }
      continue;
    }
    return response;
  }
  throw new Error(`Too many redirects for ${url}`);
}

function requestOnce(urlString, init, timeoutMs, originalUrl, originalTimeoutMs) {
  return new Promise((resolve, reject) => {
    const target = new URL(urlString);
    const lib = target.protocol === "http:" ? http : https;
    const request = lib.request(
      target,
      {
        method: init.method,
        headers: init.headers,
        ...(target.protocol === "https:" ? { agent: getHttpsAgent() } : {})
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("error", reject);
        response.on("end", () => {
          const buffered = Buffer.concat(chunks);
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            headers: response.headers,
            text: async () => buffered.toString("utf8"),
            arrayBuffer: async () => buffered.buffer.slice(buffered.byteOffset, buffered.byteOffset + buffered.byteLength)
          });
        });
      }
    );
    const timer = setTimeout(() => {
      request.destroy(new Error(`Request to ${originalUrl} timed out after ${Math.round(originalTimeoutMs / 1000)}s`));
    }, timeoutMs);
    request.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    request.on("close", () => clearTimeout(timer));
    if (init.body) request.write(init.body);
    request.end();
  });
}

function normalizeAssets(value, route) {
  const rawAssets = Array.isArray(value) ? value : [];
  return rawAssets
    .map((asset) => {
      const raw = asset && typeof asset === "object" ? asset : {};
      if (typeof raw.id !== "string" || typeof raw.name !== "string" || typeof raw.prompt !== "string") return undefined;
      const role = VALID_ROLES.includes(raw.role) ? raw.role : "prop";
      const base = {
        id: safeId(raw.id),
        role,
        name: raw.name.trim() || raw.id,
        prompt: raw.prompt.trim(),
        ...(raw.animated === true ? { animated: true } : {})
      };
      if (!base.id || !base.prompt) return undefined;
      if (route === "gemini_reference") {
        const animations = normalizeGenerateAnimations(raw.animations);
        return {
          ...base,
          assetKind: VALID_KINDS.includes(raw.assetKind) ? raw.assetKind : inferAssetKind(base),
          ...(animations ? { animations } : {})
        };
      }
      return base;
    })
    .filter(Boolean)
    .slice(0, 4);
}

// Confirmed per-asset retarget presets for the generate call (max 5, catalog
// members only). The animation-plan validator guarantees membership upstream;
// this is a lenient last-line filter so a stray value cannot spend credits.
function normalizeGenerateAnimations(value) {
  if (!Array.isArray(value)) return undefined;
  const allowed = new Set(RIG_CLIP_PRESET_ENUM);
  const presets = [...new Set(value.map((preset) => String(preset).trim()).filter(Boolean))].filter((preset) => allowed.has(preset));
  return presets.length ? presets.slice(0, 5) : undefined;
}

function selectRoute(value, args) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase().replace(/-/g, "_") : "auto";
  if (normalized === "gemini" || normalized === "gemini_reference" || normalized === "image_to_model") return "gemini_reference";
  if (normalized === "tripo" || normalized === "text_to_model") return "tripo";
  const haystack = [
    args.gamePrompt,
    ...(Array.isArray(args.assets) ? args.assets.map((asset) => `${asset?.name || ""} ${asset?.prompt || ""} ${asset?.assetKind || ""}`) : [])
  ]
    .filter(Boolean)
    .join("\n");
  if (/gemini|nano\s*banana|t[\s-]?pose|white\s*background|reference\s*image|image[\s-]?to[\s-]?model|style\s*consistency|白底|纯白背景|参考图|图生/i.test(haystack)) {
    return "gemini_reference";
  }
  return "tripo";
}

function inferAssetKind(asset) {
  const text = `${asset.role} ${asset.name} ${asset.prompt}`.toLowerCase();
  if (asset.role === "vehicle" || /car|ship|bike|truck|plane|vehicle|spaceship|submarine/.test(text)) return "vehicle";
  if (asset.role === "environment" || /building|tree|castle|room|gate|portal|environment/.test(text)) return "environment";
  if (/cat|dog|wolf|dragon|monster|creature|animal|bird|fish|ghost/.test(text)) return "creature";
  if (asset.role === "player" || /character|hero|person|npc|humanoid|robot|knight|wizard|girl|boy|man|woman/.test(text)) return "character";
  return "prop";
}

function resolveWorkspace(value) {
  if (typeof value === "string" && value.trim()) return path.resolve(value.trim());
  return process.cwd();
}

function outputPaths(workspace) {
  return {
    assetRootDir: path.join(workspace, "public", "generated-assets"),
    publicPath: "/generated-assets",
    manifestFile: path.join(workspace, "asset_manifest.json"),
    progressFile: path.join(workspace, "asset-jobs.json")
  };
}

async function isWritableDirectory(dir) {
  try {
    await access(dir);
    return true;
  } catch {
    return false;
  }
}

function readinessMessage(remote, workspaceWritable) {
  if (!workspaceWritable) return "The provided cwd does not exist or is not accessible.";
  if (remote.status === "unreachable") {
    return `Asset API at ${API_BASE} is unreachable: ${remote.message}. Check network access; set GAME_ASSETS_API_URL only when overriding the default service.`;
  }
  if (remote.status === "needs_setup") return "Asset API is reachable but not fully configured on the server (missing keys).";
  const gemini = remote.routes.gemini_reference === "configured_unverified" ? "configured and verified on first use" : remote.routes.gemini_reference;
  return `Asset API is reachable. Tripo is ${remote.routes.tripo}; Gemini reference is ${gemini}.`;
}

function summarizeGenerationResult(route, job, downloaded, output) {
  const count = downloaded.filter((asset) => asset.localUrl).length;
  return `${route} generation returned ${job.status} with ${count} loadable asset(s). Manifest: ${output.manifestFile}`;
}

function safeId(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function normalizeRigClipAnimations(value, modelVersion = DEFAULT_RIG_MODEL_VERSION) {
  if (value === undefined) return undefined;
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const animations = raw.map((animation) => String(animation).trim()).filter(Boolean);
  if (animations.length === 0) return false;
  const allowed = rigClipPresetsFor(modelVersion);
  if (animations.some((animation) => !allowed.has(animation))) return false;
  return [...new Set(animations)];
}

function presetName(preset) {
  if (typeof preset !== "string") return "";
  return preset.split(":").pop() || "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeToolResult(id, structuredContent, isError = false) {
  writeResult(id, {
    isError,
    content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent,
    structured_content: structuredContent
  });
}

function writeResult(id, result) {
  writeMessage({ jsonrpc: "2.0", id, result });
}

function writeError(id, code, message) {
  writeMessage({ jsonrpc: "2.0", id, error: { code, message } });
}

function writeMessage(message) {
  process.stdout.write(encodeJsonRpcMessage(message));
}

function encodeJsonRpcMessage(message) {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
}

function readJsonRpcMessage(buffer) {
  const headerEnd = buffer.indexOf("\r\n\r\n");
  if (headerEnd === -1) return undefined;
  const header = buffer.slice(0, headerEnd);
  const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
  if (!lengthMatch) return undefined;
  const bodyStart = headerEnd + 4;
  const bodyLength = Number(lengthMatch[1]);
  if (buffer.length < bodyStart + bodyLength) return undefined;
  const body = buffer.slice(bodyStart, bodyStart + bodyLength);
  return {
    bytesRead: bodyStart + bodyLength,
    message: JSON.parse(body)
  };
}
