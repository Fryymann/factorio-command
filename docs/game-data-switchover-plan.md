# Game data switch-over: implementation plan

Status: plan from Ian and Clyde (Ian's agent), for Kaleb's review before any code is written.
Written 2026-11-01.

**Goal:** The planner runs on `data/game-data.json` instead of the hand-typed tables, shows the game's item names, and saves machines and belts by entity name, with migrations for old saves.

## Why, and what Ian decided

#22 generated `data/game-data.json` from Factorio 2.1.24, but nothing reads it yet. This finishes #4 by moving the app onto it. It touches most of the code Kaleb ported in #14 and both saved formats, so we'd like your eyes on it before starting. If you're working on #8, #15 or #16, tell us: this plan touches `parseState` and `loadLayouts` too.

Ian's decisions (2026-11-01):

- **All 202 base-game recipes become plannable**, in two PRs in a row. This plan is PR 1, the switch-over, which keeps offering the same 35 recipes so any changed number is easy to trace. PR 2, right after, opens up the rest.
- **Item names come from the game** ("Automation science pack", not "Automation science (red)").
- **Saved data stores the game's entity names** (`assembling-machine-2`, `transport-belt`) instead of `am2` and `"15"`, with migrations and tests for `fcp-state` and `fcp-layouts`.
- For PR 2 (not planned in detail here):
  - Barrel fill/empty recipes are never used to plan, and barrel items show as "not supported".
  - Each plan gets a per-item recipe setting, starting with solid fuel (3 recipes). The fluid design (#20) later reuses it for the refinery recipe.
  - Uranium items show as "not supported" until the fluid work's multi-output solver lands.
  - Oil products stay raw inputs until the fluid work.

Calls Clyde made, open to change: the `version` field names and numbers below, short machine labels for the Modules boxes staying hand-written, and keeping the old piercing rounds recipe until the last commit so its effect is traceable.

**Architecture:** One lookup module, `src/data/game.ts`, wraps the generated data (plus the few hand-written facts the game doesn't store) and is the only thing the rest of `src/` imports for game facts. Saved-data migrations live next to each loader (`src/ui/storage.ts`, `src/modules/storage.ts`) and are pure functions with tests. Four commits in the approved order: numbers, names, saved keys, piercing rounds.

**Tech Stack:** TypeScript 7, Vitest 5, Node 24. Branch `ian/game-data-switchover` off `main` **after #24 merges**, since #24 changes `PlanSettings` and `CalcState` too.

**Based on:** Ian's decisions above; AGENTS.md; #24 (`planSettings` in `src/ui/planInput.ts` turns the form into solver input; `PlanSettings.amount` is a number, per second in rate mode; `CalcState.amount` stays what was typed); `docs/fluid-chains-design.md` (the `fcp-state` version field it plans is introduced here as version 2; fluids will take 3).

## Global Constraints

- Offered recipes stay the same 35 items (`RECIPES` keys in `legacy.ts` today). Opening up all 202 is PR 2.
- Works the same on Windows and Linux (Kaleb is on NixOS). Nothing here is OS-specific: the app runs in the browser, and the tests read only committed files (`data/game-data.json`, the goldens), never `data/raw/`.
- Oil fluids (petroleum gas, heavy oil, light oil), water, crude oil and ores stay raw inputs: `plannedRecipe` returns `undefined` for them.
- Every number comes from `game-data.json`. Hand-written and kept: inserter throughput (`INSERTERS`, `LONG`, `INS_KINDS`), swatch colour classes, the 35-item planned list, turbo belt (Space Age, until #11), short machine labels for the Modules boxes.
- Item names: the game's (`GAME.items[id].name`). No hand-written names remain.
- Saved keys: machines by entity id (`assembling-machine-2`), belts by belt entity id (`transport-belt`), furnaces by entity id. Inserter kinds keep `basic|fast|bulk|long`.
- `fcp-state` gets `version: 2`; absent means 1. `fcp-layouts` gets top-level `version: 2`; absent means 1.
- Mappings for migration (exact):
  - asm: `"0.5"→assembling-machine-1`, `"0.75"→assembling-machine-2`, `"1.25"→assembling-machine-3`
  - furn: `stone→stone-furnace`, `steel→steel-furnace`, `electric→electric-furnace`
  - mach: `am1/am2/am3→assembling-machine-1/2/3`, `stone/steel/electric→…-furnace`, `chem→chemical-plant`
  - belt (string or number): `15→transport-belt`, `30→fast-transport-belt`, `45→express-transport-belt`, `60→turbo-transport-belt`
- Unknown values in a saved file produce a visible warning and the default, never a guess (fixes #16). A layout that can't be migrated is left untouched in storage, as `loadLayouts` already does.
- Each commit leaves `npm run check` green. Golden values may change only where a commit says so, and the test states why.
- PR description calls out: `MachineKey`, `AsmSpeed`, `FurnaceKey`, `BeltTier` removed or replaced; `PlanMachine` gains `id`; `BpSettings.belt`, `ModuleEdge.belt`, `MachineNode.mach`, `ChainBasis` now hold entity ids; fixes #16; touches #8 and #15.

## Review Focus

1. A save written by the artifact (no version, `asm: "1.25"`, `belt: "45"`) must load with the same plan numbers. → Task 4 test.
2. A layout whose edge `belt` is the number `30` (artifact wrote numbers sometimes) must migrate like the string `"30"`. → Task 4 test.
3. A saved chain edit made before the change must not show "is now made in X instead of Y" notes after migration. → Task 4 test.
4. A save with `belt: "60"` (turbo) must still load and plan at 60/s. → Task 4 test.
5. Loading an already-migrated save (version 2) must not re-map or warn. → Task 4 test.

---

### Task 1: `src/data/game.ts`, the one lookup module

**Files:**

- Create: `src/data/game.ts`, `src/data/game.test.ts`
- Modify: `src/data/legacy.ts` (no removals yet; Task 2 moves consumers)

**Interfaces (Produces):**

```ts
export const GAME: GameData; // data/game-data.json, typed
export function itemName(id: string): string; // throws `Unknown item "${id}"`
export function isFluid(id: string): boolean; // throws on unknown id
export function plannedRecipe(item: string): Recipe | undefined; // only PLANNED items
export function productOf(r: Recipe, item: string): number; // throws if r doesn't make item
export function machine(id: string): Machine; // throws `Unknown machine "${id}"`
export function machinesFor(r: Recipe): Machine[]; // machines with any of r.categories, by speed
export interface BeltTier {
  id: string;
  name: string;
  itemsPerSecond: number;
  underground: string;
  splitter: string;
  U: number;
  spaceAge: boolean;
}
export const BELTS: Record<string, BeltTier>; // game belts + turbo, slowest first
export function belt(id: string): BeltTier; // throws `Unknown belt "${id}"`
export const PLANNED: readonly string[]; // the 35 ids, moved from legacy RECIPES keys
```

`U` is `undergroundMaxDistance - 1` (legacy meaning). Turbo is hand-written: `{ id: "turbo-transport-belt", name: "Turbo transport belt", itemsPerSecond: 60, underground: "turbo-underground-belt", splitter: "turbo-splitter", U: 10, spaceAge: true }`.
Until Task 5, `plannedRecipe("piercing-rounds-magazine")` returns the artifact's recipe (3 s; 1 magazine, 1 steel, 5 copper → 1) from a single `PIERCING_PRE_2_0_46` constant with a comment pointing at Task 5.

- [ ] **Step 1: Write failing tests** in `src/data/game.test.ts`:
  - `plannedRecipe("iron-gear-wheel")` has `time 0.5`, ingredients `{iron-plate: 2}`, `productOf(r,"iron-gear-wheel") === 1`
  - `plannedRecipe("petroleum-gas")`, `("iron-ore")`, `("water")` are `undefined`
  - `PLANNED` has 35 entries and every one has a `plannedRecipe`
  - `itemName("automation-science-pack") === "Automation science pack"`; `itemName("nope")` throws
  - `isFluid("water") === true`, `isFluid("iron-plate") === false`
  - `belt("transport-belt")` → `itemsPerSecond 15, U 4, underground "underground-belt", spaceAge false`; `belt("turbo-transport-belt").spaceAge === true`; `Object.keys(BELTS)` is slowest first
  - `machinesFor(plannedRecipe("sulfur")!).map(m=>m.id)` equals `["chemical-plant"]`; for `processing-unit` equals `["assembling-machine-2","assembling-machine-3"]`
- [ ] **Step 2:** `npx vitest run src/data/game.test.ts` → FAIL (module missing)
- [ ] **Step 3:** Implement `src/data/game.ts`.
- [ ] **Step 4:** Same command → PASS.
- [ ] (No commit yet; Task 2 commits together, since nothing uses `game.ts` before then.)

### Task 2: Numbers from the game (commit 1)

**Files:** Modify `src/solver/solve.ts`, `src/modules/{fromCalc,simulate}.ts`, `src/blueprint/{layout,fromModules,export}.ts`, `src/editor/{annotations,chainEdit,laneSim}.ts`, `src/ui/{calculator,modules,blueprint,blueprintDraw,common,state}.ts` and their tests where they import legacy numbers.

**Interfaces:**

- Consumes: Task 1.
- Produces:
  - `machineFor(recipe: Recipe, s: Pick<PlanSettings,"asm"|"furn">, warnings: Set<string>): PlanMachine`
  - `PlanMachine = { id: string; name: string; speed: number }`
  - Rule in `machineFor`: candidates = `machinesFor(recipe)`; chosen furnace if it's a candidate; else chosen assembler if a candidate; else if candidates include `assembling-machine-2` (fluid recipe on AM1) → AM2 + `FLUID_ASM_WARNING`; else if exactly one candidate → it; else throw `No machine for recipe "${id}"`.
  - Settings keys are still the old ones in this commit; `solve.ts` maps them with `ASM_ENTITY`/`FURN_ENTITY` tables (deleted in Task 4). Modules still pass `MachineKey`; `simulate`/`fromModules`/`layout` map it with `MACH_ENTITY` (deleted in Task 4).
  - Belt capacity everywhere: `belt(id).itemsPerSecond` via a temporary `BELT_BY_RATE` (`"15"→transport-belt`…) in `game.ts`, deleted in Task 4.
  - Burner fuel: `machine(m).energyUsage / GAME.items.coal.fuelValue` replaces `FUEL`.
  - Remove `check` tags from the calculator (every recipe now comes from the game).
- [ ] **Step 1:** Delete from `legacy.ts`: `RECIPES`, `LegacyRecipe`, `RecipeKind`, `MACH`'s numeric fields (keep `MachineKey` and a `MACH_ENTITY` map until Task 4), `BELT_TIERS`, `FUEL`. Run `npm run typecheck` → errors list every call site.
- [ ] **Step 2:** Port each call site to `game.ts`. Names still come from legacy `nm`/`short` in this commit.
- [ ] **Step 3:** `npm run check` → PASS with **no golden changes**. Any golden change here is a bug: stop and find it.
- [ ] **Step 4:** Commit "Read recipe, machine and belt numbers from game data".

### Task 3: Game names (commit 2)

**Files:** `src/data/legacy.ts` (delete `ITEMS` names, `nm`, `short`; keep swatch classes as `ITEM_CLASS: Record<string, ItemClass>`), every caller → `itemName`. Machine short labels for Modules boxes: `MACHINE_SHORT: Record<string,string>` in `src/ui/modules.ts` (`AM1/AM2/AM3`, `Stone furnace`, `Steel furnace`, `Electric furnace`, `Chem plant`), falling back to `machine(id).name`.

- [ ] **Step 1:** Write failing test in `src/blueprint/fromModules.test.ts`: green-science layout label is `"Logistic science pack module"` (was `"Logistic science module"`).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Switch callers to `itemName`.
- [ ] **Step 4:** `npm run check`. Golden tests that hash labels or warnings (`editor.test.ts` bpo/edBpo hashes, `edBpoLabel`, any layout warning text) are compared with the artifact's label restored, the way #21 restores the version (`asArtifact`); assert the new label separately. No other golden may change.
- [ ] **Step 5:** Commit "Show the game's item names".

### Task 4: Saved keys as entity ids, with migrations (commit 3)

**Files:**

- Modify: `src/solver/solve.ts` (`asm: AssemblerId`, `furn: FurnaceId` where `AssemblerId = "assembling-machine-1"|"assembling-machine-2"|"assembling-machine-3"`, `FurnaceId = "stone-furnace"|"steel-furnace"|"electric-furnace"`), `src/ui/storage.ts`, `src/ui/planInput.ts` (passes `asm`/`furn` through unchanged; `planInput.test.ts` then expects `asm: "assembling-machine-2"`, `furn: "steel-furnace"` for `DEFAULT_STATE`), `src/modules/{types,storage,fromCalc}.ts`, `src/blueprint/fromModules.ts`, `src/editor/chainEdit.ts`, UI pickers. The migration never touches `amount`: #24 already validates it in `planSettings`.
- Create: `src/data/savedKeys.ts` (+ test): the exact mappings from Global Constraints.
  ```ts
  export function migrateAsm(v: unknown): AssemblerId | null;
  export function migrateFurn(v: unknown): FurnaceId | null;
  export function migrateMach(v: unknown): string | null; // machine entity id
  export function migrateBelt(v: unknown): string | null; // belt entity id; accepts numbers
  ```
  Each returns the entity id for an old value, passes a known entity id through unchanged, and returns `null` for anything else.
- `parseState` (as reshaped by #24): `version` absent → map old keys; `version: 2` → validate as entity ids. Any `null` → default plus warning naming the field. Output always `version: 2`.
- `loadLayouts`: `version` absent → migrate each layout (nodes' `mach`, edges' `belt`, `bp.belt`, `chainEdit.basis.belt`, `chainEdit.basis.machines[*].mach`); any `null` → whole load fails with a message naming layout and field, storage untouched. `saveLayouts` writes `version: 2`.
- Delete `MachineKey`, `MACH_ENTITY`, `ASM_ENTITY`, `FURN_ENTITY`, `BELT_BY_RATE`.
- Tests (write first, watch fail):
  - `savedKeys.test.ts`: every mapping row; `migrateBelt(30) === "fast-transport-belt"`; `migrateBelt("transport-belt")` passes through; `migrateMach("am9") === null`.
  - `src/ui/storage.test.ts`: artifact save `{item:"logistic-science-pack",amount:8,mode:"buildings",asm:"1.25",furn:"stone",belt:"45",unit:"60",imports:[]}` → `asm "assembling-machine-3"`, `furn "stone-furnace"`, `belt "express-transport-belt"`, `version 2`, no error; `belt:"99"` → default belt + warning mentioning belt (#16); version-2 save with entity ids → unchanged, no warning; `belt:"60"` → `turbo-transport-belt`.
  - `src/modules/storage.test.ts`: goldens' green and blue graphs stored without `version` load with entity ids and **`simulate` gives the same per-node results as before** (compare against `goldens[name]` the way existing tests do); an edge with `belt: 30` (number) → `fast-transport-belt`; a stored chain edit with `basis.machines[x].mach: "am2"` loads as `assembling-machine-2` and `chainEdit` diff notes are empty against a fresh basis; a layout with `mach: "am9"` → load fails, message names the layout.
- [ ] Steps: tests → FAIL → implement → `npm run check` PASS with **no golden number changes** (golden graphs are now inputs to the migration) → commit "Save machines and belts by entity name, migrating old saves".

### Task 5: Piercing rounds as 2.1.24 has it (commit 4)

- [ ] **Step 1:** Write failing test in `src/data/game.test.ts`: `plannedRecipe("piercing-rounds-magazine")` is time 6, ingredients `{firearm-magazine: 2, steel-plate: 1, copper-plate: 2}`, product 2. Cite Factorio 2.0.46 changelog.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Delete `PIERCING_PRE_2_0_46`.
- [ ] **Step 4:** Add a solver test in `src/solver/solve.test.ts`: `solve({item:"military-science-pack", amount:1, mode:"buildings", asm:"assembling-machine-2", furn:"steel-furnace", imports:[]})` → the `copper-plate` build row has `rate` 0.075/s (old recipe: 0.375/s). Working: 1 AM2 × 0.75 / 10 s × 2 packs per craft = 0.075 crafts/s → 0.075 piercing magazines/s; at 2 per craft that's 0.0375 crafts/s × 2 copper = 0.075 copper/s. Piercing rounds are the only copper user in military science. (Piercing machine count and firearm magazine rate are the same under both recipes, so they can't tell them apart.)
- [ ] **Step 5:** `npm run check`. Expected: no golden changes (goldens cover green and blue science only).
- [ ] **Step 6:** Commit "Use the game's piercing rounds recipe".

### Task 6: Verify and open the PR

- [ ] `npm run check`; `npm run build`; open the built app in a browser (chrome-devtools, isolated context): Calculator with green science shows 8 AM2 and the game's names; Modules shows the example layout; Blueprint renders; load a pre-made artifact-format `fcp-state` and `fcp-layouts` in localStorage and confirm the same numbers.
- [ ] Push, open PR with the callouts in Global Constraints, link #4 ("Part of #4"), "Fixes #16".
