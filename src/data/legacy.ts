// Hand-written tables the game data doesn't cover, ported from artifacts/FCP_v1-2.html. Recipes,
// machines, belts, fuel and names come from src/data/game.ts. What's left: item colour classes (a
// UI choice) and inserter throughput, which the game doesn't store directly.

export type ItemClass =
  | "raw"
  | "fluid"
  | "plate"
  | "mid"
  | "part"
  | "red"
  | "green"
  | "mil"
  | "blue"
  | "purple"
  | "yellow";

/**
 * Swatch colour class of each item the artifact knew about. Colours are a UI choice, not game data.
 * The keys are also the list of items the Blueprint editor and Modules tab offer until #26 opens
 * up every recipe. Names come from the game (`itemName` in src/data/game.ts).
 */
export const ITEM_CLASS: Record<string, ItemClass> = {
  "iron-ore": "raw",
  "copper-ore": "raw",
  stone: "raw",
  coal: "raw",
  water: "fluid",
  "petroleum-gas": "fluid",
  "heavy-oil": "fluid",
  "iron-plate": "plate",
  "copper-plate": "plate",
  "stone-brick": "plate",
  "steel-plate": "plate",
  "iron-gear-wheel": "mid",
  "copper-cable": "mid",
  "iron-stick": "mid",
  pipe: "mid",
  "electronic-circuit": "green",
  "advanced-circuit": "red",
  "processing-unit": "blue",
  "plastic-bar": "mid",
  sulfur: "yellow",
  "sulfuric-acid": "fluid",
  lubricant: "fluid",
  "engine-unit": "mid",
  "electric-engine-unit": "mid",
  battery: "mid",
  "flying-robot-frame": "mid",
  "low-density-structure": "mid",
  inserter: "part",
  "transport-belt": "part",
  "firearm-magazine": "part",
  "piercing-rounds-magazine": "part",
  grenade: "part",
  "stone-wall": "part",
  rail: "part",
  "electric-furnace": "part",
  "productivity-module": "part",
  "automation-science-pack": "red",
  "logistic-science-pack": "green",
  "military-science-pack": "mil",
  "chemical-science-pack": "blue",
  "production-science-pack": "purple",
  "utility-science-pack": "yellow",
};

export interface InserterType {
  name: string;
  ent: string;
  cap: number; // items/s
}

export const INSERTERS: Record<"basic" | "fast" | "bulk", InserterType> = {
  basic: { name: "Inserter", ent: "inserter", cap: 0.83 },
  fast: { name: "Fast inserter", ent: "fast-inserter", cap: 2.31 },
  bulk: { name: "Bulk inserter", ent: "bulk-inserter", cap: 4.6 },
};
export const LONG: InserterType = {
  name: "Long-handed inserter",
  ent: "long-handed-inserter",
  cap: 1.15,
};

/** Inserter kinds the editor can place, keyed by `EdEnt.kind`. */
export const INS_KINDS: Record<"basic" | "fast" | "bulk" | "long", InserterType> = {
  ...INSERTERS,
  long: LONG,
};
