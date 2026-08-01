---
name: tripo-rig-clip
description: Animate an existing Tripo GLB/model task by running Tripo rig plus one-preset-at-a-time retarget, producing separate GLB files for idle/walk/run/jump clips.
---

# Tripo Rig Clip

Use this subskill when the user already has a GLB or Tripo model task and asks for rigging, auto-rigging, animation clips, retargeting, idle, walk, run, jump, or fixing Tripo multi-animation retarget issues. Also use it as the required continuation of the `gemini_reference` route for generated `character` or `creature` assets.

## Prerequisites and reach

- Every operation in this flow requires a Tripo task id (`originalModelTaskId`). A bare GLB file is not enough input.
- Local manifests written by this skill's client do not contain task ids: `asset_manifest.json` and the progress files are anonymized, and provider task ids are stripped before they reach disk.
- Consequently, GLBs generated over the direct `tripo` route — including the automatic tripo fallback that runs when `gemini_reference` is unavailable — have no locally recoverable task id and cannot enter this flow. Generate responses and progress files are anonymized the same way, so the only reachable input is a task id the user supplies from their own Tripo account. For skill-generated characters, rigging happens only inside the `gemini_reference` route's automatic server-side continuation.
- The same boundary applies to clip repair: for a skill-generated character there is no local task id to pass to `animate`, so regenerating or repairing one of its clips means a fresh `gemini_reference` generate for that asset, not an `animate` call. The "call `animate` again" path below is reachable only with a user-supplied task id.

## Non-negotiable rules

- Stable biped pipeline: `animate_rig` then `animate_retarget`.
- For biped humanoids, use Rig model `v1.0-20240301` for `/animations/rig` and retarget against the same rig version.
- Never send multiple presets in a single `/animations/retarget` request. Do not send `animations: ["preset:biped:idle", "preset:biped:walk"]` directly to Tripo.
- Tripo batch retarget can corrupt the second and later clips, often as arm crossing, center-line hand collapse, or exaggerated shoulder rotation. This is a Tripo retarget pipeline problem, not a GLB multi-clip limitation.
- Store each retargeted clip as its own GLB. Do not merge clips into one GLB in this flow.
- The default required biped clip is `preset:biped:walk` only.
- Any other preset in the parent skill's `scripts/preset-catalog.json` (for example `preset:biped:idle`, `preset:biped:run`, `preset:biped:jump`, `preset:biped:climb`, `preset:biped:run_upstairs`) is supported only when explicitly requested and confirmed through the parent skill's action requirements gate. Presets outside the catalog are rejected by the client.
- If Tripo retarget returns `failed` for required `walk` after rigging succeeds, keep the rigged GLB and use the server's local procedural fallback: embed a conservative native `Walk` clip into the main GLB. Idle remains runtime procedural motion and is never added by the fallback.

## Preferred client workflow

When the parent `generate` command uses `route: "gemini_reference"` for `assetKind: "character"` or `"creature"`, the remote asset API runs this rig/clip flow automatically after Tripo image-to-model succeeds. In that case, do not call `animate` again unless the user asks to regenerate a specific optional clip or repair a bad clip.

Use the parent skill's bundled client. It calls the asset API and splits explicit multi-preset requests into one `/api/asset-jobs/animate` call per preset.

For the required default `walk` clip, omit `animations`. The client still sends `animations: ["preset:biped:walk"]` explicitly to protect against older servers whose omitted-parameter default included idle:

```bash
node <skill-dir>/scripts/game-assets-mcp.mjs animate --cwd "$(pwd)" --params '{
  "originalModelTaskId": "task_xxxxxxxx",
  "assetId": "eleanor-blackwood",
  "assetName": "Eleanor Blackwood",
  "role": "player",
  "spec": "tripo",
  "modelVersion": "v1.0-20240301"
}'
```

For one optional clip:

```bash
node <skill-dir>/scripts/game-assets-mcp.mjs animate --cwd "$(pwd)" --params '{
  "originalModelTaskId": "task_xxxxxxxx",
  "assetId": "eleanor-blackwood",
  "assetName": "Eleanor Blackwood",
  "animations": ["preset:biped:run"]
}'
```

If the user asks for both optional clips, the client may accept `["preset:biped:run", "preset:biped:jump"]`, but it must split them into separate API calls. The server and Tripo must never receive a multi-preset retarget call.

## Output contract

The client writes or updates `asset_manifest.json`:

```json
{
  "assets": [
    {
      "id": "eleanor-blackwood",
      "role": "player",
      "name": "Eleanor Blackwood",
      "url": "/generated-assets/eleanor-blackwood-rigged.glb",
      "format": "glb",
      "rigged": true,
      "rigType": "biped",
      "animationClips": [
        { "name": "walk", "preset": "preset:biped:walk", "url": "/generated-assets/eleanor-blackwood-walk.glb", "format": "glb" }
      ]
    }
  ]
}
```

The main rigged model is for the character skin/skeleton. Each `animationClips[].url` is a separate GLB containing a retargeted clip for the compatible rig.

If Tripo retarget fails after rigging, the output may instead be:

```json
{
  "assets": [
    {
      "id": "eleanor-blackwood",
      "role": "player",
      "name": "Eleanor Blackwood",
      "url": "/generated-assets/eleanor-blackwood/model-procedural-animations.glb",
      "format": "glb",
      "rigged": true,
      "rigType": "biped",
      "animations": ["Walk"],
      "animationSource": "procedural_native_clips",
      "rigError": "preset:biped:walk: Tripo retarget task failed"
    }
  ]
}
```

In this fallback shape, the main GLB itself contains the playable clips. Do not look for separate `animationClips` entries.

## Runtime wiring

- Load the main rigged GLB with `GLTFLoader`.
- Load each clip GLB separately, read its `gltf.animations`, and map clips by `name` / `preset` substrings such as `walk`, plus explicitly present `idle`, `run`, or `jump`.
- If `animationSource` is `procedural_native_clips`, skip clip-GLB loading for that asset and use the main GLB's `Walk` animation directly.
- Play clips on the main character with `THREE.AnimationMixer`.
- Call `mixer.update(delta)` every frame.
- Implement idle at runtime on the character visual child: fade walk out, apply subtle breathing, vertical bob, and weight sway from saved base transforms without touching the gameplay root/collider or accumulating offsets, then smoothly restore the offsets while fading walk in when movement starts.
- If the Walk clip has no usable `gltf.animations`, keep the rigged/static model and use the existing whole-group movement fallback. Idle still uses the visual-child runtime motion.

## QA checklist

- Confirm `asset_manifest.json` has separate `animationClips` entries, not one GLB claiming multiple generated clips.
- Or, for retarget failure fallback, confirm `animationSource: "procedural_native_clips"` and main GLB `gltf.animations` contains `Walk` only.
- Inspect each generated GLB's `gltf.animations.length`.
- Visually test runtime idle and the walk clip first. Test explicit idle/run/jump clips only if generated.
- Watch for hand crossing, wrist collapse, shoulder over-rotation, foot sliding, and root motion drift.
- If a clip is malformed, regenerate that single preset only. Do not retry a batch retarget request.
