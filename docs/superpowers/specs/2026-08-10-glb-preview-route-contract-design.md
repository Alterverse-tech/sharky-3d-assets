# GLB Preview Route Contract

## Goal

Prevent the Shark Game Assets workflow from presenting its generation progress page as a GLB model preview.

## Required declaration

Add one normative rule to `shark-game-assets/SKILL.md`:

> When a GLB has an Asset Center `assetId`, whether it is only recalled or has already been pulled into the project, “preview model” must open `/asset-center/preview/ast_xxx`. `/regeneration.html` is only for viewing task progress while generating, regenerating, rigging, or creating animations; it must not be used or presented as a model preview link.

## Scope

- Change only the Shark Game Assets operating contract.
- Do not change Asset Center URL generation, preview pages, scripts, APIs, or download behavior.
- Preserve `/regeneration.html` as the progress surface for active generation, regeneration, rigging, and animation work.

## Acceptance

- The declaration appears under `Required behavior` in `shark-game-assets/SKILL.md`.
- Asset Center GLB preview and regeneration progress are explicitly separated.
- No runtime code or generated artifact changes.
