# README Installation Hero Design

## Goal

Turn the top of the GitHub README into a centered promotional and installation guide inspired by the supplied reference while keeping every call-to-action genuinely clickable on GitHub.

## GitHub Boundary

GitHub README files cannot run JavaScript or provide custom button behavior. The implementation will use one `<a>` element around each repository-owned SVG image. This gives each visual button its own HTTPS destination while remaining compatible with GitHub's Markdown renderer.

The prompt remains a fenced `text` block so GitHub supplies its native copy control. No custom copy script is added.

## Layout

The new block replaces the current top title and empty `Documentation and downloads` heading. It appears before the existing product screenshot and leaves the rest of the README unchanged.

```text
                  Your AI 3D Game Asset Assistant
       Generate, animate, reuse, and integrate game-ready GLBs.

 [ Open Asset Center  → ] [ Use in Codex ] [ Use in Claude ]

        Paste this prompt into any task in the Codex desktop app
 ┌─────────────────────────────────────────────────────────────┐
 │ Read .../INSTALL.md and install Shark Game Assets for me.  │
 └─────────────────────────────────────────────────────────────┘

                    Existing product screenshot
```

The hero uses centered GitHub-compatible HTML. Buttons sit on one row at normal desktop README width and wrap naturally on narrow screens.

## Copy

- Headline: `Your AI 3D Game Asset Assistant`
- Supporting line: `Generate, animate, reuse, and integrate production-ready GLB assets without leaving your coding workflow.`
- Prompt heading: `Install with one prompt in Codex`
- Prompt: `Read https://raw.githubusercontent.com/Alterverse-tech/sharky-3d-assets/main/INSTALL.md and install Shark Game Assets for me.`

## Clickable Buttons

Each button is a `248 × 64` SVG with a `10px` radius, strong text contrast, and a descriptive `alt` attribute.

1. `Open Asset Center →`
   - Black surface `#111111`, white label.
   - Link: `https://studio.13-216-49-19.sslip.io/asset-center/`
2. `Use in Codex`
   - White surface, `#DDE0E5` border, near-black label and simple monochrome mark.
   - Link: `https://github.com/Alterverse-tech/sharky-3d-assets/blob/main/INSTALL.md`
3. `Use in Claude`
   - Warm gray surface `#F2F0EE`, dark brown label, restrained coral signal mark `#E8916C`.
   - Link: `https://www.skills.sh/alterverse-tech/sharky-3d-assets/shark-game-assets`

The visuals reference the supplied hierarchy and warmth without copying proprietary logo artwork. If an SVG fails to load, its linked image alt text still identifies the action.

## Files

- Modify `README.md` only at the top promotional block and remove the now-empty documentation heading.
- Add `docs/img/button-open-asset-center.svg`.
- Add `docs/img/button-use-in-codex.svg`.
- Add `docs/img/button-use-in-claude.svg`.

No Skill, Plugin, MCP, installer, authentication, or generation logic changes.

## Verification

- Validate all three SVG files as XML.
- Check the README contains three separate `<a>` destinations and three image `alt` labels.
- Check the three HTTPS destinations return HTTP 200.
- Run `git diff --check` and confirm the diff contains only the README hero, the three SVG assets, and planning documents.
- Do not use Browser Use or Computer Use; final visual inspection uses the deterministic SVG files and rendered media previews available in the Codex app.
