# CPT Floor Orchestration Reference

Use this reference for workspace and release mechanics. Read the downloaded workspace's `FLOOR-AUTHORING.md` for the current `ctx` API and numeric budgets.

## Identity and workspace

- Valid workspace markers: `tools/new-floor.mjs`, `tools/validate.mjs`, `tools/dev-server.mjs`, and `floors/registry.json`.
- Reuse the current directory only when all markers exist.
- Default path: `~/CPT-Tower-Floors/<floor>-<key>`.
- Example: 30F 羽毛球馆 uses key `badminton30` and workspace `~/CPT-Tower-Floors/30-badminton30`.
- Author fallback: explicit request value → `git config user.name` → operating-system username.

The Hub's public registry is authoritative for published/reserved conflicts, but it cannot reveal every unpublished claim. A claim can therefore still lose a race; stop on the server conflict instead of changing identity or metadata.

## Bootstrap result

`bootstrap.mjs` writes one JSON object to stdout:

```json
{
  "workspace": "/absolute/workspace",
  "floorFile": "floors/30F-badminton30.js",
  "absoluteFloorFile": "/absolute/workspace/floors/30F-badminton30.js",
  "mode": "created",
  "ownership": "unclaimed",
  "commands": {
    "validate": ["node", "tools/validate.mjs", "floors/30F-badminton30.js"],
    "preview": ["node", "tools/dev-server.mjs"]
  }
}
```

`mode` is `created` or `reused`. `ownership` is `unclaimed` or `owned`; it never includes a token.

## Protected refresh state

The downloaded archive must contain one `cpt-floor-kit/` root and no absolute paths, traversal, symlinks, or hard links. It is extracted to staging before the target workspace changes.

Kit refresh may update instructions, sample material, validators, preview tools, and publication tools. It must never overwrite:

- `floors/*.js`
- `floors/registry.json`
- `.floor-token`

An existing invalid directory or mismatched floor metadata is a conflict, not an overwrite opportunity.

## Preview result

`verify-preview.mjs` writes:

```json
{
  "port": 3201,
  "pid": 12345,
  "reused": false,
  "url": "http://localhost:3201/?dev=floors/30F-badminton30.js",
  "moduleUrl": "http://localhost:3201/floors/30F-badminton30.js",
  "logFile": "/absolute/workspace/.cpt-dev-server-3201.log"
}
```

For a reused matching server, `pid` and `logFile` are null. The helper compares the served module bytes with the local floor; a different workspace on the same port is not reused.

## Failure recovery

| Failure | Response |
| --- | --- |
| Registry unavailable/invalid | Stop before workspace mutation; retry bootstrap when the Hub is reachable. |
| Floor reserved or occupied | Keep local state unchanged and ask for another floor. |
| Kit corrupt or unsafe | Reject before extraction into the final workspace. |
| Existing workspace invalid | Report the path; do not delete or repurpose it. |
| Floor metadata mismatch | Report expected/actual identity; do not rename or overwrite automatically. |
| Validation error | Edit locally and rerun; do not publish. |
| Preview port occupied | Reuse only on exact source match, otherwise select another port. |
| Preview readiness failure | Report the module route/log; do not present the URL as working. |
| Claim conflict | Stop; do not retry with a different author/key to bypass ownership. |
| Push rejection | Preserve source and `.floor-token`; report the server error. |

## Publication boundary

`.floor-token` is the only local ownership credential. Check key presence without displaying values. Never copy it into logs, prompts, generated docs, commits, or support messages.

Only direct publication language authorizes `claim` or `push`. Only a direct rollback request authorizes `rollback`. Tests and preview work never call production mutation endpoints.
