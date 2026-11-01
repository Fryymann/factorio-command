# Fluid production chains: design

Status: proposal from Ian, for Kaleb's review. Written 2026-10-31, revised 2026-11-01 after
the review on #20.

## Why

The planner can't plan anything that needs oil. Today the calculator treats petroleum gas, heavy
oil and water as raw inputs and stops there, so plastic, sulfur, sulfuric acid, lubricant,
batteries, blue circuits and everything above them have a hole in the middle of the chain: the
tool never says how many refineries or chemical plants to build. Players build from these
numbers, so the gap is large.

## What it is

Fluids are planned like items. Pick a target and the tool works back through the chain as it
does for solid items, but oil refineries and chemical plants are counted and sized like
assembling machines, each with its own inputs and outputs per recipe. Where items travel on
belts, fluids travel in pipes.

## Goals (version 1)

Version 1 covers the oil chain only: the refinery recipes, cracking, and the existing chemical
plant recipes that use their products (plastic, sulfur, sulfuric acid, lubricant, batteries).
(Ian.)

1. **Calculator** plans fluid chains end to end, down to raw inputs: crude oil and water, plus
   coal and steam for coal liquefaction. It gives machine counts for oil refineries and chemical
   plants, with rates per fluid, like any other row in the build list.
2. **Refinery recipe is chosen in the plan.** The plan has a setting for which oil recipe the
   refineries run. The options are every base-game recipe in the `oil-processing` category:
   basic oil processing, advanced oil processing and coal liquefaction.
3. **Surplus is shown, and the player decides what happens to it.** A refinery makes several
   fluids at fixed ratios, so a plan usually makes more of some fluid than it uses. Each fluid
   in surplus shows as its own line (e.g. "Heavy oil: 25/min surplus"). For each one:
   - **Store** is always offered: the fluid leaves the chain as an output, and the rest of the
     plan doesn't change.
   - **Crack** is offered only for heavy oil and light oil, the fluids that have a cracking
     recipe (heavy oil → light oil, light oil → petroleum gas). Petroleum gas can only be
     stored. Cracking adds chemical plants, and the cracked product counts toward what the
     chain needs. If the chain needs it, the refinery count drops to match. If the chain doesn't
     need it, the cracked product becomes surplus in turn, with its own store/crack choice.
     The refinery count doesn't change, and the plan says so on that surplus line. Example:
     with advanced oil processing and a lubricant-only target, cracking light oil only adds
     surplus petroleum gas.

   The choice is saved with the plan, the same way Import choices are today.

4. **Oil products can be imported, and old plans keep their numbers.** There's no separate
   "oil as input" setting. Import already covers it: marking petroleum gas, heavy oil and light
   oil as Import means they come in from outside and no refineries are planned for them. (Ian,
   after review.)
   - The Calculator gets a one-click **"Import all oil products"** shortcut. It just sets those
     three Imports, and they can be undone one by one like any other Import. It's for players
     who bring oil products in on a main bus.
   - **Plans saved before this change load with those three fluids added to their Imports**,
     so their numbers don't change. See "Saved data" below for how.
5. **Modules** shows the same chain as blocks. "Send to Modules" turns refineries and chemical
   plants into machine blocks with their inputs and outputs, connected by pipe edges instead of
   belt edges. Stored surplus becomes an output block. Cracking becomes chemical plant blocks
   wired in with pipes. This needs a change to the Modules data model (see "Saved data").

   **The simulation behaves like the game** (Clyde's call): a block with several outputs runs
   only as fast as its least-drained output allows. If one output has nowhere to go, the block
   stalls and is shown as blocked. Deleting a stored-surplus output block therefore stalls the
   refinery and everything that depends on it. Surplus never quietly disappears. Today's
   simulation works backwards from demand and lets a block with no outgoing edge run flat out,
   so multi-output blocks need new logic, not an extension of the current rule.

   **Coal liquefaction stays in the Calculator for version 1.** It feeds heavy oil back into
   itself, and the Modules simulation can't handle loops: it sorts blocks in order and would
   read the loop's flow before working it out. "Send to Modules" on a coal liquefaction plan
   shows a visible warning and sends nothing. (Ian, after review.)

## Saved data and shared types

Both saved formats change, so both need a migration with tests, and the PR has to call out the
shared-type change (AGENTS.md).

- **`fcp-state` (calculator).** It has no version number today, and `parseState` fills any
  missing field with its default, so an old save can't be told apart from a new one. Add a
  version field. A save without one is from before this change: on load, add `petroleum-gas`,
  `heavy-oil` and `light-oil` to its `imports`. (Don't add the plan's own target; `solve`
  already drops the target from imports.) A brand-new state, or one that couldn't be read,
  starts with no oil imports. Test: load a saved plan from before the change and check that
  its numbers match the artifact goldens.
- **`fcp-layouts` (Modules) and `src/modules/types.ts`.** Today a block has one item, its
  recipe is looked up by that item (`RECIPES[n.item]`), and an edge's item is the item of the
  block it comes from (`itemOf(e.from)` in `simulate.ts`). A refinery's three output pipes would
  all carry the same fluid. Blocks need a recipe id, and edges need their own item. Old layouts
  migrate on load: each machine block gets the recipe of its item, and each edge gets its source
  block's item. Test: old layouts load unchanged and simulate to the same numbers.

## Decisions on edge cases (Clyde's calls)

- **Import keeps today's meaning.** Marking a fluid Import means all of it comes from outside.
  Whatever the refineries make of it anyway becomes surplus, with the usual store/crack choice.
- **A fluid can be the plan target only as a rate** (per minute), not as a number of buildings.
- **Blueprints keep today's behaviour.** Chemical plant rows with piped-in fluids still lay out
  as they do now. Refinery and cracking rows are left out of blueprints (whole chain and single
  module alike), with a visible warning that they're missing. Rows are filtered by recipe, not
  by how the row is keyed: anything in the `oil-processing` category, plus `heavy-oil-cracking`
  and `light-oil-cracking`. A cracking row keyed by its product (`light-oil`) must not slip
  through to `planLayout`.
- **Basic oil processing can't supply heavy or light oil.** If the chosen recipe can't make a
  fluid the chain needs, the plan shows a warning and does not guess.
- **Solid fuel, rocket fuel, uranium and barrel recipes** stay out of v1. If the generated data
  makes them pickable, the calculator shows them as not supported rather than planning them
  with a guessed recipe.

## Non-goals (version 1)

- **New blueprint layouts.** No refinery or cracking layouts in blueprints. That's a later
  version, after this one has settled. What blueprints already do today stays (see Decisions).
- **Coal liquefaction in Modules** (see Goal 5).
- **Pumpjacks.** Crude oil and water are inputs, like ore. How many pumpjacks a field needs
  depends on its yield, which the tool can't know.
- **Pipe capacity limits.** Pipe edges show flow per minute but no "% full", until we've confirmed
  from the game how much a pipe run carries. A missing number is better than a wrong one.
- **Other ways to use up surplus**, such as solid fuel or lubricant as a sink. Store and crack only.
- **Partial cracking.** For each fluid it's all stored or all cracked.
- **Space Age fluids and machines.**

## Anti-goals

- A plan that quietly ignores surplus or byproducts. If the numbers don't balance, the tool must
  show it, never round it away.
- Fluid numbers taken from anywhere but the game data dump.

## Game data (Factorio 2.1.24, base, from `data/raw/data-raw-dump.json`)

| Recipe                  | Time | Machine        | In                              | Out                                     |
| ----------------------- | ---- | -------------- | ------------------------------- | --------------------------------------- |
| basic-oil-processing    | 5 s  | oil refinery   | 100 crude oil                   | 45 petroleum gas                        |
| advanced-oil-processing | 5 s  | oil refinery   | 100 crude oil, 50 water         | 25 heavy oil, 45 light oil, 55 pet. gas |
| coal-liquefaction       | 5 s  | oil refinery   | 10 coal, 25 heavy oil, 50 steam | 90 heavy oil, 20 light oil, 10 pet. gas |
| heavy-oil-cracking      | 2 s  | chemical plant | 40 heavy oil, 30 water          | 30 light oil                            |
| light-oil-cracking      | 2 s  | chemical plant | 30 light oil, 30 water          | 20 petroleum gas                        |

Oil refinery: crafting speed 1, two fluid inputs, three fluid outputs. Chemical plant: crafting
speed 1, two fluid inputs, two outputs. These are for orientation; the code reads them from the
generated data, not from this table.

## Constraints

- **Depends on #4.** Oil recipes and the oil refinery aren't in the hand-written `legacy.ts`
  tables. They come from the generated game data (#4). The calculator solver being extended is
  the one ported in #14, which has merged.
- AGENTS.md applies as usual: per-second rates internally, fail loudly, tests with real values
  (expected values worked out from the game data, with the recipe cited), and migrations with
  tests for saved data (see "Saved data and shared types").

## Left to the builder

- **How the solver handles recipes with several outputs.** The current solver walks a tree with
  one recipe per item, and that can't handle refineries. Whether to use a linear solve, a fixed
  oil step, or something else is the builder's choice, as long as the numbers are exact and
  tested.
- **Coal liquefaction's loop in the Calculator.** It consumes heavy oil that it also produces.
  Steam is a raw input, like water. How the solver handles the loop is left to the builder. If
  it's much harder than the other two recipes, say so in the PR rather than shipping something
  approximate.
- The name and shape of the `fcp-state` version field, and how blocks and edges store their
  recipe and item.
- The default refinery recipe and the default surplus choice, provided they're visible in the UI.
- Where the surplus lines, the recipe setting and the "Import all oil products" shortcut sit in
  the Calculator layout.
