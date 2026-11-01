// The one place the rest of src/ gets game facts from: data/game-data.json (generated from
// Factorio's own data by scripts/extract-data.ts), plus the few facts the game doesn't store,
// which stay hand-written here and say so. Rates are per second.
import raw from "../../data/game-data.json" with { type: "json" };
import type { GameData, Item, Machine, Recipe } from "./types.ts";

export const GAME = raw as GameData;

/**
 * `table[key]`, but only for the table's own keys. Every JavaScript object also answers to
 * built-in names like "constructor" and "toString", so a plain lookup would accept those from
 * saved or typed data. Use this for any key that didn't come from the code itself.
 */
export function own<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

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
  const it = own(GAME.items, id);
  if (!it) throw new Error(`Unknown item "${id}"`);
  return it;
}

export const itemName = (id: string): string => item(id).name;
export const isFluid = (id: string): boolean => item(id).fluid;

// Which items the planner can make, and how (#26). Every game recipe counts except:
// - filling and emptying barrels: they move fluids around rather than make them;
// - recipes that make oil products: those stay raw inputs until the fluid work (#27);
// and some items can't be planned yet, with a reason the UI shows.
const OIL_PRODUCTS = new Set(["petroleum-gas", "heavy-oil", "light-oil"]);
// A filled barrel ("water-barrel"). The empty "barrel" is an ordinary item, made from steel and
// used by cliff explosives.
const isFilledBarrel = (id: string) => id.endsWith("-barrel");
const ROCKET_LAUNCH =
  "Rocket parts aren't planned yet: the time a rocket launch takes isn't modelled, so the rate would be too high.";
const URANIUM = "Uranium isn't planned yet: its processing makes two products at once by chance.";
const BARREL =
  "Barrels aren't planned: filling and emptying barrels moves fluids, it doesn't make them.";

/** The recipe used when an item has several and the plan doesn't choose. */
const DEFAULT_RECIPE: Record<string, string> = { "solid-fuel": "solid-fuel-from-light-oil" };

const allMaking = new Map<string, Recipe[]>();
for (const r of Object.values(GAME.recipes)) {
  for (const p of Object.keys(r.products)) allMaking.set(p, [...(allMaking.get(p) ?? []), r]);
}
const usable = (r: Recipe) =>
  ![...Object.keys(r.ingredients), ...Object.keys(r.products)].some(isFilledBarrel) &&
  !Object.keys(r.products).some((p) => OIL_PRODUCTS.has(p));

// Items that can't be planned, with why. Seeded, then spread to everything that can only be made
// from them.
const UNSUPPORTED = new Map<string, string>([["rocket-part", ROCKET_LAUNCH]]);
for (const r of Object.values(GAME.recipes)) {
  if (r.categories.includes("centrifuging"))
    for (const p of Object.keys(r.products)) UNSUPPORTED.set(p, URANIUM);
}
for (const id of Object.keys(GAME.items)) {
  if (!GAME.items[id]!.fluid && isFilledBarrel(id)) UNSUPPORTED.set(id, BARREL);
}
for (let changed = true; changed;) {
  changed = false;
  for (const [id, rs] of allMaking) {
    if (UNSUPPORTED.has(id)) continue;
    const ok = rs.filter(usable);
    if (ok.length === 0) continue;
    const blocked = ok.map((r) => Object.keys(r.ingredients).find((i) => UNSUPPORTED.has(i)));
    if (blocked.every((b) => b !== undefined)) {
      UNSUPPORTED.set(id, UNSUPPORTED.get(blocked[0]!)!);
      changed = true;
    }
  }
}

/** Every recipe the planner may use to make `id`; empty for raw inputs and unsupported items. */
export function recipesFor(id: string): Recipe[] {
  if (UNSUPPORTED.has(id)) return [];
  return (allMaking.get(id) ?? [])
    .filter(usable)
    .filter((r) => !Object.keys(r.ingredients).some((i) => UNSUPPORTED.has(i)));
}

/** Why `id` can't be planned, or undefined if it can (or is a raw input). */
export function unsupported(id: string): string | undefined {
  return UNSUPPORTED.get(id);
}

/**
 * The recipe the planner uses to make `id`, or undefined if `id` is a raw input or can't be
 * planned. `choice` picks one of `recipesFor(id)`; without it, the item's default is used.
 */
export function plannedRecipe(id: string, choice?: string): Recipe | undefined {
  const rs = recipesFor(id);
  if (rs.length === 0) return undefined;
  const want = choice ?? own(DEFAULT_RECIPE, id) ?? (rs.length === 1 ? rs[0]!.id : undefined);
  const r = rs.find((x) => x.id === want);
  if (!r) {
    throw new Error(
      choice
        ? `"${choice}" isn't a recipe the planner uses for "${id}"`
        : `"${id}" has several recipes and no default`,
    );
  }
  const cached = ordered.get(r.id);
  if (cached) return cached;
  const out = inArtifactOrder(r);
  ordered.set(r.id, out);
  return out;
}

const sortKey = (id: string) => {
  const it = GAME.items[id]!;
  return [GAME.groups[it.group]!.order, GAME.subgroups[it.subgroup]!.order, it.order, id];
};

/** Every item in the game data, in the game's crafting-menu order. */
export const ITEMS_IN_ORDER: readonly string[] = Object.keys(GAME.items).sort((a, b) => {
  const x = sortKey(a);
  const y = sortKey(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i]! < y[i]! ? -1 : 1;
  return 0;
});

/** Items the planner can make, in the game's crafting-menu order. */
export const PLANNABLE: readonly string[] = ITEMS_IN_ORDER.filter(
  (id) => recipesFor(id).length > 0,
);
for (const id of PLANNABLE) plannedRecipe(id); // every item made several ways needs a default

/** How many of `item` one craft of `r` makes. */
export function productOf(r: Recipe, id: string): number {
  const n = r.products[id];
  if (n === undefined) throw new Error(`Recipe "${r.id}" doesn't make "${id}"`);
  return n;
}

export function machine(id: string): Machine {
  const m = own(GAME.machines, id);
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
  const b = own(BELTS, id);
  if (!b) throw new Error(`Unknown belt "${id}"`);
  return b;
}
