// Hand-written tables that the game data doesn't cover yet, ported from artifacts/FCP_v1-2.html.
// Recipes, machines, belts and fuel now come from src/data/game.ts. What's left here goes in the
// next step of the switch-over (docs/game-data-switchover-plan.md): the old machine keys (Task 4). Inserter throughput stays hand-written: the game doesn't store it.

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

export type MachineKey = "am1" | "am2" | "am3" | "stone" | "steel" | "electric" | "chem";

/** The artifact's machine keys, still used by saved layouts until Task 4 renames them. */
export const MACH_ENTITY: Record<MachineKey, string> = {
  am1: "assembling-machine-1",
  am2: "assembling-machine-2",
  am3: "assembling-machine-3",
  stone: "stone-furnace",
  steel: "steel-furnace",
  electric: "electric-furnace",
  chem: "chemical-plant",
};
export const MACH_KEYS = Object.keys(MACH_ENTITY) as MachineKey[];

/** Short labels for the Modules boxes; the game has no short names. */
export const MACH_SHORT: Record<MachineKey, string> = {
  am1: "AM1",
  am2: "AM2",
  am3: "AM3",
  stone: "Stone furnace",
  steel: "Steel furnace",
  electric: "Electric furnace",
  chem: "Chem plant",
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
