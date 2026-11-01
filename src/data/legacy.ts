// Hand-written tables that the game data doesn't cover yet, ported from artifacts/FCP_v1-2.html.
// Recipes, machines, belts and fuel now come from src/data/game.ts. What's left here goes in the
// next steps of the switch-over (docs/game-data-switchover-plan.md): item names (Task 3) and the
// old machine keys (Task 4). Inserter throughput stays hand-written: the game doesn't store it.

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

/** [display name, swatch class, isFluid?] */
type ItemRow = readonly [string, ItemClass] | readonly [string, ItemClass, true];

export const ITEMS: Record<string, ItemRow> = {
  "iron-ore": ["Iron ore", "raw"],
  "copper-ore": ["Copper ore", "raw"],
  stone: ["Stone", "raw"],
  coal: ["Coal", "raw"],
  water: ["Water", "fluid", true],
  "petroleum-gas": ["Petroleum gas", "fluid", true],
  "heavy-oil": ["Heavy oil", "fluid", true],
  "iron-plate": ["Iron plate", "plate"],
  "copper-plate": ["Copper plate", "plate"],
  "stone-brick": ["Stone brick", "plate"],
  "steel-plate": ["Steel plate", "plate"],
  "iron-gear-wheel": ["Iron gear wheel", "mid"],
  "copper-cable": ["Copper cable", "mid"],
  "iron-stick": ["Iron stick", "mid"],
  pipe: ["Pipe", "mid"],
  "electronic-circuit": ["Electronic circuit", "green"],
  "advanced-circuit": ["Advanced circuit", "red"],
  "processing-unit": ["Processing unit", "blue"],
  "plastic-bar": ["Plastic bar", "mid"],
  sulfur: ["Sulfur", "yellow"],
  "sulfuric-acid": ["Sulfuric acid", "fluid", true],
  lubricant: ["Lubricant", "fluid", true],
  "engine-unit": ["Engine unit", "mid"],
  "electric-engine-unit": ["Electric engine unit", "mid"],
  battery: ["Battery", "mid"],
  "flying-robot-frame": ["Flying robot frame", "mid"],
  "low-density-structure": ["Low density structure", "mid"],
  inserter: ["Inserter", "part"],
  "transport-belt": ["Transport belt", "part"],
  "firearm-magazine": ["Firearm magazine", "part"],
  "piercing-rounds-magazine": ["Piercing rounds magazine", "part"],
  grenade: ["Grenade", "part"],
  "stone-wall": ["Wall", "part"],
  rail: ["Rail", "part"],
  "electric-furnace": ["Electric furnace", "part"],
  "productivity-module": ["Productivity module", "part"],
  "automation-science-pack": ["Automation science (red)", "red"],
  "logistic-science-pack": ["Logistic science (green)", "green"],
  "military-science-pack": ["Military science (grey)", "mil"],
  "chemical-science-pack": ["Chemical science (blue)", "blue"],
  "production-science-pack": ["Production science (purple)", "purple"],
  "utility-science-pack": ["Utility science (yellow)", "yellow"],
};

/** Display name, falling back to the id for anything not in the table. */
export const nm = (id: string): string => ITEMS[id]?.[0] ?? id;
/** Display name without a trailing " (colour)" note. */
export const short = (id: string): string => nm(id).split(" (")[0] ?? id;

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
