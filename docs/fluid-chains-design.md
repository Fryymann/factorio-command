# Fluid production chains: design

Status: proposal from Ian, for Kaleb's review. Written 2026-10-31.

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

Version 1 covers the oil chain only: crude oil through the refinery to heavy oil, light oil and
petroleum gas, cracking, and the existing chemical plant recipes that use them (plastic, sulfur,
sulfuric acid, lubricant, batteries). (Ian.)

1. **Calculator** plans fluid chains end to end, down to crude oil and water: machine counts for
   oil refineries and chemical plants, with rates per fluid, like any other row in the build list.
2. **Refinery recipe is chosen in the plan.** The plan has a setting for which oil recipe the
   refineries run. The options are every base-game recipe in the `oil-processing` category:
   basic oil processing, advanced oil processing and coal liquefaction.
3. **Surplus is shown, and the player decides what happens to it.** A refinery makes several
   fluids at fixed ratios, so a plan usually makes more of some fluid than it uses. Each fluid
   in surplus shows as its own line (e.g. "Heavy oil: 25/min surplus"), and the player chooses
   per fluid:
   - **Store:** it leaves the chain as an output. The rest of the plan doesn't change.
   - **Crack:** the plan adds chemical plants that crack it down (heavy oil → light oil →
     petroleum gas), and the cracked fluid counts toward what the chain needs, so the refinery
     count drops to match.

   The choice is saved with the plan, the same way Import choices are today.

4. **"Oil as input" option.** A plan setting that keeps today's behaviour: petroleum gas, heavy
   oil and light oil are raw inputs, and no refineries are planned. It's for players who bring
   oil products in on a main bus, and it's **on for every plan saved before this change**, so
   saved plans show the same numbers as before. New plans start with it off. (Ian.)
5. **Modules** shows the same chain as blocks. "Send to Modules" turns refineries and chemical
   plants into machine blocks with their inputs and outputs, connected by pipe edges instead of
   belt edges. Stored surplus becomes an output block. Cracking becomes chemical plant blocks
   wired in with pipes.

   **The simulation behaves like the game** (Clyde's call): a block with several outputs runs
   only as fast as its least-drained output allows. If one output has nowhere to go, the block
   stalls and is shown as blocked. Deleting a stored-surplus output block therefore stalls the
   refinery and everything that depends on it. Surplus never quietly disappears. Today's
   simulation works backwards from demand and lets a block with no outgoing edge run flat out,
   so multi-output blocks need new logic, not an extension of the current rule.

## Decisions on edge cases (Clyde's calls)

- **Import keeps today's meaning.** Marking a fluid Import means all of it comes from outside.
  Whatever the refineries make of it anyway becomes surplus, with the usual store/crack choice.
- **A fluid can be the plan target only as a rate** (per minute), not as a number of buildings.
- **Blueprints keep today's behaviour.** Chemical plant rows with piped-in fluids still lay out
  as they do now. Refinery and cracking rows are left out of blueprints, with a visible warning
  that they're missing. The blueprint code reads the build list by item id, so any new rows keyed
  by recipe must be filtered out before they reach it.
- **Basic oil processing can't supply heavy or light oil.** If the chosen recipe can't make a
  fluid the chain needs, the plan shows a warning and does not guess.
- **Solid fuel, rocket fuel, uranium and barrel recipes** stay out of v1. If the generated data
  makes them pickable, the calculator shows them as not supported rather than planning them
  with a guessed recipe.

## Non-goals (version 1)

- **New blueprint layouts.** No refinery or cracking layouts in blueprints. That's a later
  version, after this one has settled. What blueprints already do today stays (see Decisions).
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

- **Depends on #4 and #14.** Oil recipes and the oil refinery aren't in the hand-written
  `legacy.ts` tables. They come from the generated game data (#4). The calculator solver being
  extended is the one Kaleb ported in #14. Building starts after both have merged.
- AGENTS.md applies as usual: per-second rates internally, fail loudly, tests with real values
  (expected values worked out from the game data, with the recipe cited), and `fcp-state` /
  `fcp-layouts` must keep loading. Saved plans load with "oil as input" on, so their numbers
  don't change; a test should load a saved plan from before this change and check its numbers
  against the artifact goldens.

## Left to the builder

- **How the solver handles recipes with several outputs.** The current solver walks a tree with
  one recipe per item, and that can't handle refineries. Whether to use a linear solve, a fixed
  oil step, or something else is the builder's choice, as long as the numbers are exact and
  tested.
- **Coal liquefaction's loop.** It consumes heavy oil that it also produces, and it needs steam.
  How to plan the loop and where steam comes from (an input, like water, is the simplest) is
  left to the builder. If it's much harder than the other two recipes, say so in the PR rather
  than shipping something approximate.
- The default refinery recipe and the default surplus choice, provided they're visible in the UI.
- Where the surplus lines and the recipe setting sit in the Calculator layout.
