---
name: third-person-escape-room-game
description: Build or regenerate a browser-runnable third-person top-down 3D escape room game from a supplied script, with script-faithful story/map/theme, camera-relative WASD, realistic collision, and lightweight playtest expectations.
---

# Third-Person Top-Down 3D Escape Room Game

Use this subskill when the user asks to generate, regenerate, or substantially revise a 3D escape room game whose requirements match:

- Game type: third-person top-down 3D escape room.
- Tech stack: Three.js with native JavaScript, or React Three Fiber when the existing project already uses React.
- Runtime: directly runnable in a browser.
- Source content: script, visual style, logic plot, map, characters, and theme must come from the supplied script.
- Physics: obey realistic physical constraints unless the script explicitly establishes a supernatural effect.

## Non-Negotiable Game Requirements

- Build the playable game, not a landing page, trailer page, or only an asset viewer.
- Use the supplied script as the source of truth for story beats, room order, puzzle logic, map layout, character roles, props, endings, and visual tone.
- Keep the first playable screen inside the actual game experience.
- Use a third-person top-down camera that keeps the player visible and gives enough room context for navigation.
- The browser entry should run from a local dev server or static HTML page without requiring external manual setup beyond installing dependencies and starting the provided script.
- Prefer native Three.js and plain JavaScript for small standalone games. Use React Three Fiber only when the repo already has React/R3F conventions or the user asks for it.
- Do not invent unrelated rooms, mechanics, or characters just to fill space. Add only what helps the script become playable.

## Lighting And Readability

- Default brightness must be playable. Gothic, horror, castle, or night scenes may be moody, but the player, walls, doors, interactable props, NPCs, and exit paths must remain readable.
- If the scene feels too dark, raise ambient/hemisphere/key light intensity, add local warm fill lights, and tune tone mapping/exposure before adding visual noise.
- Avoid relying on pure black surfaces or unlit props for critical gameplay objects.

## Controls And Player Feel

- WASD movement must be camera-relative:
  - `W` moves toward the camera's forward direction projected onto the ground plane.
  - `S` moves backward from that direction.
  - `A` and `D` strafe relative to the camera's right vector projected onto the ground plane.
  - Movement vectors must be normalized so diagonals are not faster.
- Add keyboard shortcuts for core operations. At minimum include movement keys, interaction key, hint/objective key when the game has hints, and modal/choice confirmation/cancel shortcuts where relevant.
- Player face/body orientation must follow the actual movement direction. If the imported model has a modeling-space forward offset, define one stable visual facing offset and apply it consistently.
- When the player moves forward, the visible face must not point sideways. Test all four directions and diagonals after any model swap.
- Keep input responsive while respecting modal/dialog states. Do not let the player move while a puzzle modal requires focused input unless the UI explicitly supports it.

## Collision And Physical Rules

- The player must not enter walls, locked doors, closed gates, solid furniture, or other non-passable geometry.
- Collision must use a circular footprint/capsule-style ground footprint, not only a center-point test.
- Represent the player collision on the ground as a radius. Before accepting a move, test multiple points around the circle or sweep the intended movement so the footprint cannot clip through thin walls or corners.
- Keep visual meshes separate from gameplay hitboxes. Imported GLB bounds should not redefine puzzle collision unless explicitly authored as collision geometry.
- Doors, levers, cabinets, keys, props, and puzzles should obey plausible physical behavior:
  - Doors rotate on hinges or slide along tracks.
  - Heavy objects do not float or pass through walls.
  - Keys unlock matching locks instead of opening unrelated spaces.
  - Liquid, light, mirrors, clocks, and mechanisms should behave in a physically understandable way unless the script calls out supernatural rules.
- Always preserve gameplay fallbacks if a GLB fails to load. A missing model should not make the level impossible.

## Script-To-Game Mapping

- Extract the script into a concise implementation map before coding:
  - rooms / areas
  - gates / locks
  - puzzles and required clues
  - inventory items
  - NPC and antagonist appearances
  - endings and fail states
  - visual style and recurring motifs
- Build map boundaries and puzzle dependencies from that implementation map.
- Keep room progression and puzzle solutions consistent with the script's logic.
- Use text prompts, notes, dialogues, and item names that match the script's theme.

## 3D Asset Use

- Use the parent `shark-game-assets` rules for GLB generation, manifest handling, fallbacks, and live regeneration preview.
- For key entity characters and story-critical entity props, use the Gemini-Tripo branch (`route: "gemini_reference"`) and keep the count to 1-8 models total.
- For secondary static props, use `route: "tripo"` and keep the count to 3-15 models total only when those props materially improve gameplay readability.
- Do not reuse historical GLBs when the user explicitly asks for regeneration without reuse.
- Wire generated assets into the game using `GLTFLoader`, normalize them with a stable scale/grounding pass, and keep primitive fallbacks.

## Testing And Playtest Expectations

- Run build/static checks before handoff.
- When the user explicitly asks for browser/computer playtesting, or when active instructions allow it, perform a short browser/computer playtest. Keep it focused; do not spend excessive time trying to exhaust every branch.
- If active thread instructions prohibit unapproved browser/computer use, ask for permission before using those tools. If permission is not available, provide a clear manual playtest checklist instead.
- The simple playtest should check:
  - WASD is camera-relative.
  - Player face turns toward actual movement direction.
  - Circular footprint collision prevents entering walls and closed doors.
  - Player cannot bypass locked gates by clipping corners.
  - Interactables can be reached and triggered.
  - At least one main puzzle chain can be completed.
  - The level remains physically plausible.
- Playable handoff has priority. If automated/browser verification is slow or flaky but the game is already runnable, provide the playable URL first, state what was and was not verified, then continue verification only if the user wants it.

## Delivery Checklist

- Provide the runnable URL or local file path.
- Mention the script-derived rooms, puzzles, and characters that were implemented.
- Mention generated GLB assets and which route created them.
- Mention collision model: circular footprint/capsule-style gameplay radius.
- Mention camera-relative WASD and shortcut keys.
- Mention tests run, including whether browser/computer playtest was performed or skipped due to permission/speed constraints.
