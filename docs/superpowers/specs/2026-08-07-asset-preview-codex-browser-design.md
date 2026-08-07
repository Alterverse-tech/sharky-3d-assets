# Asset preview links open in Codex Browser

## Goal

In the Asset Sourcing Board, an Asset Center or project GLB preview link opens in Codex's built-in Browser on a normal left click. Its right-click menu remains the native Codex link menu, including the in-browser, system-browser, and copy choices provided by the host.

## Scope

- Applies only to rows with an already validated HTTP/HTTPS `previewUrl`.
- Keeps the existing link label, `target="_blank"`, and safe URL validation.
- Does not alter asset selection, catalog loading, import, or generation behavior.

## Design

`AssetSourcingBoard` will render its preview link as a normal anchor without a click handler. The current handler cancels the native navigation and forwards the URL through `ui/open-link`, which causes the two-option custom dialog. Removing that interception lets Codex receive the real anchor navigation and render its built-in link behavior.

The now-unused `openHostLink` bridge and its external-browser fallback will be removed, so the feature has one unambiguous opening path: Codex owns native link opening and its context menu.

## Error handling and verification

- Invalid or absent URLs remain non-links through the existing `safePreviewUrl` allowlist.
- The normal build/type check confirms the React source remains valid.
- Manual acceptance: left-click a candidate link opens Codex Browser; right-click shows Codex's native menu rather than the custom two-option dialog.
