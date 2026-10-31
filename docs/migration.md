# Migration: single-file artifact → Vite + TypeScript

The working planner is `artifacts/FCP_v1-2.html`: one 2,173-line HTML file with CSS, markup
and script inline. This document maps it onto the module layout in `AGENTS.md` and lists the
migration tasks in order. Line numbers refer to `FCP_v1-2.html` at commit `42f84e0`.

The artifacts are frozen. Don't edit them; port from them.

## Source map

| Lines     | Section in the artifact                                | Target                                     |
| --------- | ------------------------------------------------------ | ------------------------------------------ |
| 7–247     | CSS (dark steel theme, amber accent)                   | `src/ui/styles.css`                        |
| 248–426   | Markup: tabs, calculator, modules, blueprint, notes    | `index.html` + `src/ui/`                   |
| 428–494   | `ITEMS`, `RECIPES`, `PICKABLE`, furnace/assembler maps | replaced by `data/game-data.json` (task 2) |
| 495–499   | Calculator state + `localStorage` (`fcp-state`)        | `src/ui/storage.ts`                        |
| 500–548   | Solver: `machineFor`, `targetRate`, `solve`            | `src/solver/`                              |
| 549–653   | Calculator rendering + wiring                          | `src/ui/calculator.ts`                     |
| 654–736   | Modules: `MACH`, layout store (`fcp-layouts`)          | `src/modules/` + `src/ui/storage.ts`       |
| 737–821   | Modules: `simulate` (flow simulation)                  | `src/modules/simulate.ts`                  |
| 822–1213  | Modules: node rendering, inspector, canvas, toolbar    | `src/ui/modules/`                          |
| 1214–1406 | Blueprint: tiers, inserters, `planLayout`              | `src/blueprint/layout.ts`                  |
| 1407–1423 | `DIR16`, `blueprintObject`                             | `src/blueprint/export.ts`                  |
| 1424–1473 | Module graph → layout input                            | `src/blueprint/fromModules.ts`             |
| 1474–1709 | Blueprint rendering + canvas                           | `src/ui/blueprint/`                        |
| 1710–1716 | `encodeBlueprint`                                      | `src/blueprint/encode.ts` (**done**)       |
| 1730–1760 | Editor: directions, footprints, `edFromLayout`         | `src/editor/`                              |
| 1761–1852 | Editor: `laneSim` (belt lane simulation)               | `src/editor/laneSim.ts`                    |
| 1853–2151 | Editor: actions, UI, drawing, pointer                  | `src/editor/` (logic) + `src/ui/editor/`   |
| 2152–end  | Tab switching, boot                                    | `src/main.ts`                              |

## Tasks

1. **Port logic as-is, with tests.** Move the solver, `simulate`, `planLayout`, `laneSim` and
   the blueprint export into typed modules with no DOM access. Before changing any behaviour,
   write tests that pin down what the artifact does today (for example, 8 assembler-2s of green
   science and its plate inputs). Keep the hand-written recipe tables for now in
   `src/data/legacy.ts`.
2. **Generate game data.** Implement `scripts/extract-data.ts` against a Factorio 2.0 base-game
   `--dump-data` file. Swap `legacy.ts` for `data/game-data.json`. Any number that changes is
   a bug in either the old tables or the extractor: find out which, and don't just update the
   test.
3. **Port the UI** tab by tab: Calculator, then Modules, then Blueprint. The app should work
   after each tab lands.
4. **Saved-data compatibility.** People have layouts in `localStorage` under `fcp-state` and
   `fcp-layouts`. Read the old shape, or migrate it. Never silently drop it.
5. **Retire the artifact** once `npm run build` does everything `FCP_v1-2.html` does.

## Noticed while mapping (not fixed, needs checking)

- `blueprintObject` (line 1415) writes every inserter with `direction: 0`. The editor's
  exporter (line 2143) sets a real direction. Whole-chain blueprints may have inserters facing
  the wrong way. Check this in game.
- The two exporters (`blueprintObject`, `edBlueprintObject`) are near-duplicates. Merge them
  during task 1.
- Recipes flagged `check: true` (low density structure, piercing rounds, military science) have
  never been confirmed against the game. Task 2 settles them.
- Turbo belt (60/s) is in the belt list, but it is Space Age only. Gate it behind a Space Age
  setting once that exists.
