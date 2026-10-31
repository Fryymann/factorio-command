// DRAFT data model. Agree on it in the migration PR before other modules depend on it.
// All rates in the code are items (or fluid units) per second. Convert units only in src/ui.

export type ItemId = string; // Factorio internal name, e.g. "iron-gear-wheel"

export interface Item {
  id: ItemId;
  name: string; // display name
  fluid: boolean;
}

/** Machine category a recipe can run in: Factorio's recipe "category" (crafting, smelting, chemistry, ...). */
export type RecipeCategory = string;

export interface Recipe {
  id: string;
  category: RecipeCategory;
  time: number; // seconds per craft at crafting speed 1
  ingredients: Record<ItemId, number>;
  products: Record<ItemId, number>; // usually one product; several for oil processing, etc.
}

export interface Machine {
  id: string; // entity name, e.g. "assembling-machine-2"
  name: string;
  speed: number; // crafting speed
  categories: RecipeCategory[];
  size: number; // tile footprint (square)
  burner: boolean;
}

/** Everything extracted from one game version. Generated into data/, never edited by hand. */
export interface GameData {
  factorioVersion: string; // e.g. "2.0.66"
  mods: string[]; // e.g. ["base"]; Space Age adds "space-age", "quality", "elevated-rails"
  items: Record<ItemId, Item>;
  recipes: Record<string, Recipe>;
  machines: Record<string, Machine>;
}
