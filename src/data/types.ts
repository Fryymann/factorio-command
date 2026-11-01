// Game data model, generated into data/game-data.json by scripts/extract-data.ts.
// All rates in the code are items (or fluid units) per second. Convert units only in src/ui.
// Everything here comes from the game's own data dump; see scripts/extract.ts for how.

export type ItemId = string; // Factorio internal name, e.g. "iron-gear-wheel"

/** A recipe category, e.g. "crafting", "smelting", "chemistry", "oil-processing". */
export type RecipeCategory = string;

export interface Item {
  id: ItemId;
  name: string; // English display name, from the game's locale
  fluid: boolean;
  /** Energy per item when burned, in joules. Only for items that can be burned. */
  fuelValue?: number;
}

export interface Recipe {
  id: string;
  name: string; // English display name, from the game's locale
  /** A recipe can be made by any machine that has at least one of these categories. */
  categories: RecipeCategory[];
  time: number; // seconds per craft at crafting speed 1
  ingredients: Record<ItemId, number>; // per craft
  /**
   * Per craft. Several for oil processing and the like. Where the game rolls a chance (uranium
   * processing), this is the expected amount. An item can be both an ingredient and a product
   * (coal liquefaction, Kovarex); both sides are listed in full, not netted.
   */
  products: Record<ItemId, number>;
}

export interface Machine {
  id: string; // entity name, e.g. "assembling-machine-2"
  name: string;
  speed: number; // crafting speed
  categories: RecipeCategory[];
  size: number; // tile footprint (square)
  burner: boolean; // burns fuel; otherwise electric
  energyUsage: number; // watts while working
}

/** One belt tier: the belt, and the underground and splitter that run at the same speed. */
export interface Belt {
  id: string; // belt entity name, e.g. "fast-transport-belt"
  name: string;
  itemsPerSecond: number; // both lanes together
  underground: string;
  /** The game's max_distance: the exit can be at most this many tiles from the entrance. */
  undergroundMaxDistance: number;
  splitter: string;
}

/** Everything extracted from one game version. Generated into data/, never edited by hand. */
export interface GameData {
  factorioVersion: string; // version of the base mod, e.g. "2.1.24"
  mods: string[]; // e.g. ["base"]; Space Age adds "space-age", "quality", "elevated-rails"
  items: Record<ItemId, Item>;
  recipes: Record<string, Recipe>;
  machines: Record<string, Machine>;
  belts: Record<string, Belt>; // slowest first
}
