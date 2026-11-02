// The hand-typed tables from artifacts/FCP_v1-2.html, frozen as test data so gameData.test.ts can
// show the generated game data agrees with them (and where it doesn't). Never used by the app.

export type RecipeKind = "craft" | "fluidcraft" | "smelt" | "chem";

export interface LegacyRecipe {
  time: number;
  out: number;
  ins: Record<string, number>;
  kind: RecipeKind;
  check: boolean;
}

const R = (
  time: number,
  out: number,
  ins: Record<string, number>,
  kind: RecipeKind = "craft",
  check = false,
): LegacyRecipe => ({ time, out, ins, kind, check });

export const RECIPES: Record<string, LegacyRecipe> = {
  "iron-plate": R(3.2, 1, { "iron-ore": 1 }, "smelt"),
  "copper-plate": R(3.2, 1, { "copper-ore": 1 }, "smelt"),
  "stone-brick": R(3.2, 1, { stone: 2 }, "smelt"),
  "steel-plate": R(16, 1, { "iron-plate": 5 }, "smelt"),
  "iron-gear-wheel": R(0.5, 1, { "iron-plate": 2 }),
  "copper-cable": R(0.5, 2, { "copper-plate": 1 }),
  "iron-stick": R(0.5, 2, { "iron-plate": 1 }),
  pipe: R(0.5, 1, { "iron-plate": 1 }),
  "electronic-circuit": R(0.5, 1, { "iron-plate": 1, "copper-cable": 3 }),
  "advanced-circuit": R(6, 1, { "plastic-bar": 2, "copper-cable": 4, "electronic-circuit": 2 }),
  "processing-unit": R(
    10,
    1,
    { "electronic-circuit": 20, "advanced-circuit": 2, "sulfuric-acid": 5 },
    "fluidcraft",
  ),
  "plastic-bar": R(1, 2, { "petroleum-gas": 20, coal: 1 }, "chem"),
  sulfur: R(1, 2, { water: 30, "petroleum-gas": 30 }, "chem"),
  "sulfuric-acid": R(1, 50, { "iron-plate": 1, sulfur: 5, water: 100 }, "chem"),
  lubricant: R(1, 10, { "heavy-oil": 10 }, "chem"),
  "engine-unit": R(10, 1, { "steel-plate": 1, "iron-gear-wheel": 1, pipe: 2 }),
  "electric-engine-unit": R(
    10,
    1,
    { "engine-unit": 1, "electronic-circuit": 2, lubricant: 15 },
    "fluidcraft",
  ),
  battery: R(4, 1, { "iron-plate": 1, "copper-plate": 1, "sulfuric-acid": 20 }, "chem"),
  "flying-robot-frame": R(20, 1, {
    "electric-engine-unit": 1,
    battery: 2,
    "steel-plate": 1,
    "electronic-circuit": 3,
  }),
  "low-density-structure": R(
    15,
    1,
    { "steel-plate": 2, "copper-plate": 20, "plastic-bar": 5 },
    "craft",
    true,
  ),
  inserter: R(0.5, 1, { "electronic-circuit": 1, "iron-gear-wheel": 1, "iron-plate": 1 }),
  "transport-belt": R(0.5, 2, { "iron-gear-wheel": 1, "iron-plate": 1 }),
  "firearm-magazine": R(1, 1, { "iron-plate": 4 }),
  "piercing-rounds-magazine": R(
    3,
    1,
    { "firearm-magazine": 1, "steel-plate": 1, "copper-plate": 5 },
    "craft",
    true,
  ),
  grenade: R(8, 1, { coal: 10, "iron-plate": 5 }),
  "stone-wall": R(0.5, 1, { "stone-brick": 5 }),
  rail: R(0.5, 2, { stone: 1, "steel-plate": 1, "iron-stick": 1 }),
  "electric-furnace": R(5, 1, { "steel-plate": 10, "advanced-circuit": 5, "stone-brick": 10 }),
  "productivity-module": R(15, 1, { "advanced-circuit": 5, "electronic-circuit": 5 }),
  "automation-science-pack": R(5, 1, { "copper-plate": 1, "iron-gear-wheel": 1 }),
  "logistic-science-pack": R(6, 1, { inserter: 1, "transport-belt": 1 }),
  "military-science-pack": R(
    10,
    2,
    { "piercing-rounds-magazine": 1, grenade: 1, "stone-wall": 2 },
    "craft",
    true,
  ),
  "chemical-science-pack": R(24, 2, { "engine-unit": 2, "advanced-circuit": 3, sulfur: 1 }),
  "production-science-pack": R(21, 3, {
    "electric-furnace": 1,
    "productivity-module": 1,
    rail: 30,
  }),
  "utility-science-pack": R(21, 3, {
    "low-density-structure": 3,
    "processing-unit": 2,
    "flying-robot-frame": 1,
  }),
};

export const MACH: Record<
  string,
  {
    name: string;
    short: string;
    speed: number;
    kinds: RecipeKind[];
    ent: string;
    size: number;
    burner: boolean;
  }
> = {
  am1: {
    name: "Assembling machine 1",
    short: "AM1",
    speed: 0.5,
    kinds: ["craft"],
    ent: "assembling-machine-1",
    size: 3,
    burner: false,
  },
  am2: {
    name: "Assembling machine 2",
    short: "AM2",
    speed: 0.75,
    kinds: ["craft", "fluidcraft"],
    ent: "assembling-machine-2",
    size: 3,
    burner: false,
  },
  am3: {
    name: "Assembling machine 3",
    short: "AM3",
    speed: 1.25,
    kinds: ["craft", "fluidcraft"],
    ent: "assembling-machine-3",
    size: 3,
    burner: false,
  },
  stone: {
    name: "Stone furnace",
    short: "Stone furnace",
    speed: 1,
    kinds: ["smelt"],
    ent: "stone-furnace",
    size: 2,
    burner: true,
  },
  steel: {
    name: "Steel furnace",
    short: "Steel furnace",
    speed: 2,
    kinds: ["smelt"],
    ent: "steel-furnace",
    size: 2,
    burner: true,
  },
  electric: {
    name: "Electric furnace",
    short: "Electric furnace",
    speed: 2,
    kinds: ["smelt"],
    ent: "electric-furnace",
    size: 3,
    burner: false,
  },
  chem: {
    name: "Chemical plant",
    short: "Chem plant",
    speed: 1,
    kinds: ["chem"],
    ent: "chemical-plant",
    size: 3,
    burner: false,
  },
};

export const BELT_TIERS: Record<
  string,
  { name: string; belt: string; ug: string; sp: string; U: number }
> = {
  "15": {
    name: "Transport belt",
    belt: "transport-belt",
    ug: "underground-belt",
    sp: "splitter",
    U: 4,
  },
  "30": {
    name: "Fast belt",
    belt: "fast-transport-belt",
    ug: "fast-underground-belt",
    sp: "fast-splitter",
    U: 6,
  },
  "45": {
    name: "Express belt",
    belt: "express-transport-belt",
    ug: "express-underground-belt",
    sp: "express-splitter",
    U: 8,
  },
  "60": {
    name: "Turbo belt",
    belt: "turbo-transport-belt",
    ug: "turbo-underground-belt",
    sp: "turbo-splitter",
    U: 10,
  },
};

export const FUEL = 0.09 / 4;

/** The artifact's 42 known items and whether each is a fluid (its ITEMS table, names dropped). */
export const ITEM_FLUID: Record<string, boolean> = {
  "iron-ore": false,
  "copper-ore": false,
  stone: false,
  coal: false,
  water: true,
  "petroleum-gas": true,
  "heavy-oil": true,
  "iron-plate": false,
  "copper-plate": false,
  "stone-brick": false,
  "steel-plate": false,
  "iron-gear-wheel": false,
  "copper-cable": false,
  "iron-stick": false,
  pipe: false,
  "electronic-circuit": false,
  "advanced-circuit": false,
  "processing-unit": false,
  "plastic-bar": false,
  sulfur: false,
  "sulfuric-acid": true,
  lubricant: true,
  "engine-unit": false,
  "electric-engine-unit": false,
  battery: false,
  "flying-robot-frame": false,
  "low-density-structure": false,
  inserter: false,
  "transport-belt": false,
  "firearm-magazine": false,
  "piercing-rounds-magazine": false,
  grenade: false,
  "stone-wall": false,
  rail: false,
  "electric-furnace": false,
  "productivity-module": false,
  "automation-science-pack": false,
  "logistic-science-pack": false,
  "military-science-pack": false,
  "chemical-science-pack": false,
  "production-science-pack": false,
  "utility-science-pack": false,
};
