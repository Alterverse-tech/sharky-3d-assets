# Verified regeneration-preview link delivery

## Goal

Make every successful Shark Game Assets preview discoverable: users receive a clickable `regeneration.html` URL as soon as it has been verified and again in the final handoff.

## Scope

- Applies to tasks that create, restore, generate, rig, animate, or integrate GLB assets and start a local regeneration preview.
- Uses the actual loopback origin and port confirmed for the current project.
- Does not treat an HTTP check as visual gameplay or character-orientation acceptance.

## Delivery contract

Before reporting a link, the workflow must confirm the intended listener with `lsof`, run `validate-regeneration-preview.mjs`, and request the exact URL `http://127.0.0.1:<port>/regeneration.html`. Only an HTTP `200` response permits link delivery.

The first progress update after that verification and the final user-facing handoff must each include this exact Markdown shape:

```md
素材预览：[http://127.0.0.1:<port>/regeneration.html](http://127.0.0.1:<port>/regeneration.html)
```

The surrounding status may report GLB hashes, HTTP paths, QA, or residual risks. It must not leave the preview as a bare path or port. If the listener or page check does not pass, report that the preview is temporarily unavailable and do not manufacture a link.

## Implementation and verification

The same concise rule will live in the repository source and the active `.agents` installed copy because they currently differ. The repository's focused documentation bench will assert the required Markdown label, exact `/regeneration.html` URL shape, HTTP-200 gate, first-update requirement, final-handoff requirement, and unavailable fallback. The installed copy will then be checked against those required phrases.
