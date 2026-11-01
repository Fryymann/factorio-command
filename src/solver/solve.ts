// Calculator math, ported unchanged from `machineFor`, `targetRate` and `solve`
// (artifacts/FCP_v1-2.html, lines 500-547). Pure: settings in, plan out. Rates are per second.
// Differences from the artifact: unknown items and machine settings throw instead of
// crashing later with a TypeError, and the settings are passed in rather than read from a global.
// The target is already a number, and in "rate" mode already per second: parsing what the
// player typed and converting from per minute happens in src/ui/planInput.ts (#19).
import { RECIPES } from "../data/legacy.ts";
import type { LegacyRecipe } from "../data/legacy.ts";

export type AsmSpeed = "0.5" | "0.75" | "1.25";
export type FurnaceKey = "stone" | "steel" | "electric";
export type TargetMode = "buildings" | "rate";

export const FURNACE: Record<FurnaceKey, readonly [string, number]> = {
  stone: ["Stone furnace", 1],
  steel: ["Steel furnace", 2],
  electric: ["Electric furnace", 2],
};
export const ASM_NAME: Record<AsmSpeed, string> = {
  "0.5": "Assembling machine 1",
  "0.75": "Assembling machine 2",
  "1.25": "Assembling machine 3",
};

export interface PlanSettings {
  item: string;
  /** Buildings of the final product, or in "rate" mode items per second of it. */
  amount: number;
  mode: TargetMode;
  asm: AsmSpeed;
  furn: FurnaceKey;
  imports: string[];
}

export interface PlanMachine {
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

function recipeOf(id: string): LegacyRecipe {
  const r = RECIPES[id];
  if (!r) throw new Error(`No recipe for "${id}"`);
  return r;
}

export function machineFor(
  kind: LegacyRecipe["kind"],
  s: Pick<PlanSettings, "asm" | "furn">,
  warnings: Set<string>,
): PlanMachine {
  if (kind === "smelt") {
    const f = FURNACE[s.furn];
    if (!f) throw new Error(`Unknown furnace "${s.furn}"`);
    return { name: f[0], speed: f[1] };
  }
  if (kind === "chem") return { name: "Chemical plant", speed: 1 };
  let sp = s.asm;
  if (kind === "fluidcraft" && sp === "0.5") {
    sp = "0.75";
    warnings.add(FLUID_ASM_WARNING);
  }
  const name = ASM_NAME[sp];
  if (!name) throw new Error(`Unknown assembler speed "${String(sp)}"`);
  return { name, speed: parseFloat(sp) };
}

/** Items per second of the final product. Throws on a negative or non-finite amount. */
export function targetRate(s: PlanSettings): number {
  const r = recipeOf(s.item);
  const amt = s.amount;
  if (!Number.isFinite(amt) || amt < 0) throw new Error(`Invalid target amount ${String(amt)}`);
  if (s.mode === "rate") return amt;
  const m = machineFor(r.kind, s, new Set());
  return (amt * m.speed * r.out) / r.time;
}

export function solve(s: PlanSettings): Plan {
  const warnings = new Set<string>();
  const imports = new Set(s.imports.filter((i) => i !== s.item));
  const made = new Map<string, { rate: number; depth: number }>();
  const inputs = new Map<string, InputRow>();

  function expand(id: string, rate: number, depth: number): PlanNode {
    const recipe = RECIPES[id];
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
    const m = machineFor(recipe.kind, s, warnings);
    const crafts = rate / recipe.out;
    node.machine = m;
    node.count = (crafts * recipe.time) / m.speed;
    const cur = made.get(id) ?? { rate: 0, depth: 0 };
    cur.rate += rate;
    cur.depth = Math.max(cur.depth, depth);
    made.set(id, cur);
    for (const [inId, qty] of Object.entries(recipe.ins)) {
      node.children.push(expand(inId, crafts * qty, depth + 1));
    }
    return node;
  }

  const tree = expand(s.item, targetRate(s), 0);
  const build = [...made.entries()]
    .map(([id, v]) => {
      const r = recipeOf(id);
      const m = machineFor(r.kind, s, warnings);
      const exact = ((v.rate / r.out) * r.time) / m.speed;
      return {
        id,
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
    const qty = recipeOf(b.id).ins[id];
    if (qty) r += (b.rate / recipeOf(b.id).out) * qty;
  }
  return r;
}
