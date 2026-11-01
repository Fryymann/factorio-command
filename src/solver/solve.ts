// Calculator math, ported unchanged from `machineFor`, `targetRate` and `solve`
// (artifacts/FCP_v1-2.html, lines 500-547). Pure: settings in, plan out. Rates are per second.
// Differences from the artifact: unknown items and machine settings throw instead of
// crashing later with a TypeError, and the settings are passed in rather than read from a global.
// The target is already a number, and in "rate" mode already per second: parsing what the
// player typed and converting from per minute happens in src/ui/planInput.ts (#19).
// Recipes and machine speeds come from the game data (src/data/game.ts).
import { GAME, belt, machine, machinesFor, own, plannedRecipe, productOf } from "../data/game.ts";
import type { Recipe } from "../data/types.ts";

/** Assembler the plan uses for crafting recipes (entity name). */
export type AssemblerId = "assembling-machine-1" | "assembling-machine-2" | "assembling-machine-3";
/** Furnace the plan uses for smelting (entity name). */
export type FurnaceId = "stone-furnace" | "steel-furnace" | "electric-furnace";
export type TargetMode = "buildings" | "rate";

export interface PlanSettings {
  item: string;
  /** Buildings of the final product, or in "rate" mode items per second of it. */
  amount: number;
  mode: TargetMode;
  asm: AssemblerId;
  furn: FurnaceId;
  imports: string[];
  /** Which recipe makes an item that has several (`recipesFor`); unlisted items use the default. */
  recipes?: Record<string, string>;
}

export interface PlanMachine {
  id: string; // entity name
  name: string;
  speed: number;
}

export interface PlanNode {
  id: string;
  rate: number;
  depth: number;
  children: PlanNode[];
  leaf: boolean;
  imported: boolean;
  machine?: PlanMachine;
  count?: number;
}

export interface BuildRow {
  id: string;
  recipe: string; // id of the recipe this row's machines run
  rate: number;
  depth: number;
  machine: PlanMachine;
  exact: number;
  count: number;
}

export interface InputRow {
  rate: number;
  imported: boolean;
}

export interface Plan {
  tree: PlanNode;
  build: BuildRow[];
  inputs: Map<string, InputRow>;
  warnings: Set<string>;
}

export const FLUID_ASM_WARNING =
  "Recipes with fluid ingredients need Assembling machine 2 or better. Those rows assume Assembling machine 2.";

function recipeOf(id: string, choices?: Record<string, string>): Recipe {
  const r = plannedRecipe(id, choices && own(choices, id));
  if (!r) throw new Error(`No recipe for "${id}"`);
  return r;
}

/**
 * The building that makes `recipe` under these settings: the chosen furnace or assembler when it
 * can, Assembling machine 2 (with a warning) for a fluid recipe when Assembling machine 1 is
 * chosen, or the only machine that can (chemical plant).
 */
export function machineFor(
  recipe: Recipe,
  s: Pick<PlanSettings, "asm" | "furn">,
  warnings: Set<string>,
): PlanMachine {
  const furn = s.furn;
  const asm = s.asm;
  if (!own(GAME.machines, furn)?.categories.includes("smelting"))
    throw new Error(`Unknown furnace "${String(furn)}"`);
  if (!own(GAME.machines, asm)?.categories.includes("crafting"))
    throw new Error(`Unknown assembler "${String(asm)}"`);
  const ids = machinesFor(recipe).map((m) => m.id);
  let id: string;
  if (ids.includes(furn)) id = furn;
  else if (ids.includes(asm)) id = asm;
  else if (ids.includes("assembling-machine-2")) {
    id = "assembling-machine-2";
    warnings.add(FLUID_ASM_WARNING);
  } else if (ids.length === 1) id = ids[0]!;
  else throw new Error(`No machine for recipe "${recipe.id}"`);
  const m = machine(id);
  return { id: m.id, name: m.name, speed: m.speed };
}

/** Items per second of the final product. Throws on a negative or non-finite amount. */
export function targetRate(s: PlanSettings): number {
  const r = recipeOf(s.item, s.recipes);
  const amt = s.amount;
  if (!Number.isFinite(amt) || amt < 0) throw new Error(`Invalid target amount ${String(amt)}`);
  if (s.mode === "rate") return amt;
  const m = machineFor(r, s, new Set());
  return (amt * m.speed * productOf(r, s.item)) / r.time;
}

export function solve(s: PlanSettings): Plan {
  const warnings = new Set<string>();
  const imports = new Set(s.imports.filter((i) => i !== s.item));
  const made = new Map<string, { rate: number; depth: number }>();
  const inputs = new Map<string, InputRow>();

  function expand(id: string, rate: number, depth: number): PlanNode {
    const recipe = plannedRecipe(id, s.recipes && own(s.recipes, id));
    const isLeaf = !recipe || (depth > 0 && imports.has(id));
    const node: PlanNode = {
      id,
      rate,
      depth,
      children: [],
      leaf: isLeaf,
      imported: isLeaf && !!recipe,
    };
    if (isLeaf || !recipe) {
      const cur = inputs.get(id) ?? { rate: 0, imported: !!recipe };
      cur.rate += rate;
      inputs.set(id, cur);
      return node;
    }
    const m = machineFor(recipe, s, warnings);
    const crafts = rate / productOf(recipe, id);
    node.machine = m;
    node.count = (crafts * recipe.time) / m.speed;
    const cur = made.get(id) ?? { rate: 0, depth: 0 };
    cur.rate += rate;
    cur.depth = Math.max(cur.depth, depth);
    made.set(id, cur);
    for (const [inId, qty] of Object.entries(recipe.ingredients)) {
      node.children.push(expand(inId, crafts * qty, depth + 1));
    }
    return node;
  }

  const tree = expand(s.item, targetRate(s), 0);
  const build = [...made.entries()]
    .map(([id, v]) => {
      const r = recipeOf(id, s.recipes);
      const m = machineFor(r, s, warnings);
      const exact = ((v.rate / productOf(r, id)) * r.time) / m.speed;
      return {
        id,
        recipe: r.id,
        rate: v.rate,
        depth: v.depth,
        machine: m,
        exact,
        count: Math.ceil(exact - 1e-9),
      };
    })
    .sort((a, b) => a.depth - b.depth);
  // Ore feeding the furnaces is shown as an input automatically; plates only appear as inputs
  // when imported.
  return { tree, build, inputs, warnings };
}

/** Items per second of `id` consumed by the whole build list (built here or imported). */
export function consumption(build: BuildRow[], id: string): number {
  let r = 0;
  for (const b of build) {
    const rec = plannedRecipe(b.id, b.recipe);
    if (!rec) throw new Error(`No recipe for "${b.id}"`);
    const qty = rec.ingredients[id];
    if (qty) r += (b.rate / productOf(rec, b.id)) * qty;
  }
  return r;
}

/** How many belt lanes and whole belts of `beltId` a rate (items/s) fills. */
export function beltUsage(rate: number, beltId: string): { lanes: number; belts: number } {
  const perBelt = belt(beltId).itemsPerSecond;
  return { lanes: rate / (perBelt / 2), belts: rate / perBelt };
}
