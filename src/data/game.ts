// The one place the rest of src/ gets game facts from: data/game-data.json (generated from
// Factorio's own data by scripts/extract-data.ts), plus the few facts the game doesn't store,
// which stay hand-written here and say so. Rates are per second.
import raw from "../../data/game-data.json" with { type: "json" };
import type { GameData, Item, Machine, Recipe } from "./types.ts";

export const GAME = raw as GameData;

/**
 * The items the planner makes, each with the game recipe of the same name. The same 35 as the
 * artifact; opening up every recipe is #26. Anything else (ores, water, oil products) is a raw
 * input.
 */
export const PLANNED: readonly string[] = [
  "iron-plate",
  "copper-plate",
  "stone-brick",
  "steel-plate",
  "iron-gear-wheel",
  "copper-cable",
  "iron-stick",
  "pipe",
  "electronic-circuit",
  "advanced-circuit",
  "processing-unit",
  "plastic-bar",
  "sulfur",
  "sulfuric-acid",
  "lubricant",
  "engine-unit",
  "electric-engine-unit",
  "battery",
  "flying-robot-frame",
  "low-density-structure",
  "inserter",
  "transport-belt",
  "firearm-magazine",
  "piercing-rounds-magazine",
  "grenade",
  "stone-wall",
  "rail",
  "electric-furnace",
  "productivity-module",
  "automation-science-pack",
  "logistic-science-pack",
  "military-science-pack",
  "chemical-science-pack",
  "production-science-pack",
  "utility-science-pack",
];
const PLANNED_SET = new Set(PLANNED);

// The artifact's piercing rounds recipe, from before Factorio 2.0.46 made it cheaper. Kept only
// so that switching to game data changes no number by itself; the switch-over's last commit
// removes it and uses the game's recipe.
const PIERCING_PRE_2_0_46: Recipe = {
  id: "piercing-rounds-magazine",
  name: "Piercing rounds magazine",
  categories: ["crafting"],
  time: 3,
  ingredients: { "firearm-magazine": 1, "steel-plate": 1, "copper-plate": 5 },
  products: { "piercing-rounds-magazine": 1 },
};

// The artifact's ingredient order for the 7 planned recipes where it differs from the game's. The
// blueprint layout places bus columns and the Modules graph places blocks in ingredient order, so
// the game's order gives different (still valid) layouts: blue science gets 6 more belts and 2
// fewer undergrounds. Kept so the switch to game data changes no layout by itself; whether to
// adopt the game's order is a separate decision.
const ARTIFACT_INGREDIENT_ORDER: Record<string, readonly string[]> = {
  "advanced-circuit": ["plastic-bar", "copper-cable", "electronic-circuit"],
  "sulfuric-acid": ["iron-plate", "sulfur", "water"],
  "electric-engine-unit": ["engine-unit", "electronic-circuit", "lubricant"],
  battery: ["iron-plate", "copper-plate", "sulfuric-acid"],
  "transport-belt": ["iron-gear-wheel", "iron-plate"],
  grenade: ["coal", "iron-plate"],
  rail: ["stone", "steel-plate", "iron-stick"],
};

function inArtifactOrder(r: Recipe): Recipe {
  const order = ARTIFACT_INGREDIENT_ORDER[r.id];
  if (!order) return r;
  const keys = Object.keys(r.ingredients);
  if (keys.length !== order.length || !order.every((k) => k in r.ingredients)) {
    throw new Error(`Ingredient order for "${r.id}" no longer matches the game data`);
  }
  return { ...r, ingredients: Object.fromEntries(order.map((k) => [k, r.ingredients[k]!])) };
}
const ordered = new Map<string, Recipe>();

function item(id: string): Item {
  const it = GAME.items[id];
  if (!it) throw new Error(`Unknown item "${id}"`);
  return it;
}

export const itemName = (id: string): string => item(id).name;
export const isFluid = (id: string): boolean => item(id).fluid;

/** The recipe the planner uses to make `item`, or undefined if the item is a raw input. */
export function plannedRecipe(id: string): Recipe | undefined {
  if (!PLANNED_SET.has(id)) return undefined;
  if (id === "piercing-rounds-magazine") return PIERCING_PRE_2_0_46;
  const cached = ordered.get(id);
  if (cached) return cached;
  const r = GAME.recipes[id];
  if (!r) throw new Error(`No game recipe for planned item "${id}"`);
  const out = inArtifactOrder(r);
  ordered.set(id, out);
  return out;
}

/** How many of `item` one craft of `r` makes. */
export function productOf(r: Recipe, id: string): number {
  const n = r.products[id];
  if (n === undefined) throw new Error(`Recipe "${r.id}" doesn't make "${id}"`);
  return n;
}

export function machine(id: string): Machine {
  const m = GAME.machines[id];
  if (!m) throw new Error(`Unknown machine "${id}"`);
  return m;
}

/** Machines that can make `r`, slowest first (ties by id, so the order is stable). */
export function machinesFor(r: Recipe): Machine[] {
  return Object.values(GAME.machines)
    .filter((m) => m.categories.some((c) => r.categories.includes(c)))
    .sort((a, b) => a.speed - b.speed || a.id.localeCompare(b.id));
}

export interface BeltTier {
  id: string; // belt entity name
  name: string;
  itemsPerSecond: number; // both lanes
  underground: string;
  splitter: string;
  U: number; // most tiles between an underground's entrance and exit
  spaceAge: boolean;
}

// Turbo belt is Space Age, so it isn't in the base-game data. Hand-written until #11 adds a
// Space Age setting.
const TURBO: BeltTier = {
  id: "turbo-transport-belt",
  name: "Turbo transport belt",
  itemsPerSecond: 60,
  underground: "turbo-underground-belt",
  splitter: "turbo-splitter",
  U: 10,
  spaceAge: true,
};

export const BELTS: Record<string, BeltTier> = Object.fromEntries(
  [
    ...Object.values(GAME.belts).map((b): BeltTier => ({
      id: b.id,
      name: b.name,
      itemsPerSecond: b.itemsPerSecond,
      underground: b.underground,
      splitter: b.splitter,
      U: b.undergroundMaxDistance - 1,
      spaceAge: false,
    })),
    TURBO,
  ]
    .sort((a, b) => a.itemsPerSecond - b.itemsPerSecond)
    .map((b) => [b.id, b]),
);

export function belt(id: string): BeltTier {
  const b = BELTS[id];
  if (!b) throw new Error(`Unknown belt "${id}"`);
  return b;
}

// The old belt keys (items per second), still used by saved data until Task 4 of the switch-over
// replaces them with belt entity ids and deletes this table.
const BELT_BY_RATE: Record<string, string> = {
  "15": "transport-belt",
  "30": "fast-transport-belt",
  "45": "express-transport-belt",
  "60": "turbo-transport-belt",
};

/** The old belt keys with their tiers, slowest first, for pickers that still store old keys. */
export const BELT_KEY_TIERS = (): [string, BeltTier][] =>
  Object.keys(BELT_BY_RATE).map((k) => [k, beltByKey(k)]);

/** The belt tier for an old key ("15", or the number 15). Throws on anything else. */
export function beltByKey(key: string | number): BeltTier {
  const id = BELT_BY_RATE[String(key)];
  if (!id) throw new Error(`Unknown belt tier ${JSON.stringify(key)}`);
  return belt(id);
}
