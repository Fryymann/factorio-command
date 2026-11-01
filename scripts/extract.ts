// Pure extraction: Factorio's data dump + English locale -> GameData (src/data/types.ts).
// The command-line wrapper is extract-data.ts. Anything unexpected in the dump throws, so a
// new game version can't quietly produce wrong numbers.
import type { Belt, GameData, Item, Machine, Recipe } from "../src/data/types.ts";

export type RawProto = Record<string, unknown>;
/** data-raw-dump.json: prototype type -> name -> prototype. */
export type RawDump = Record<string, Record<string, RawProto>>;
type Names = Record<string, string>;

export interface ExtractInput {
  dump: RawDump;
  /** The "names" tables of item-, fluid-, entity- and recipe-locale.json (--dump-prototype-locale). */
  locale: { item: Names; fluid: Names; entity: Names; recipe: Names };
  factorioVersion: string;
  mods: string[];
}

export interface ExtractResult {
  data: GameData;
  /** Prototypes left out on purpose, one line each, e.g. "recipe pistol: hidden". */
  skipped: string[];
}

const MACHINE_TYPES = ["assembling-machine", "furnace", "rocket-silo"];

// Defaults the game applies when a recipe leaves them out
// (https://lua-api.factorio.com/latest/prototypes/RecipePrototype.html).
const DEFAULT_TIME = 0.5;
const DEFAULT_CATEGORIES = ["crafting"];

// A belt lane holds 4 items per tile, so a belt carries 8 items per tile across both lanes
// (https://wiki.factorio.com/Transport_belts/Physics). Speed is tiles per tick, 60 ticks a second.
const BELT_ITEMS_PER_TILE = 8;
const TICKS_PER_SECOND = 60;

const INGREDIENT_KEYS = new Set(["type", "name", "amount", "fluidbox_index", "ignored_by_stats"]);
// ignored_by_productivity only matters with productivity bonuses, which the planner doesn't model.
const RESULT_KEYS = new Set([
  "type",
  "name",
  "amount",
  "probability",
  "shared_probability",
  "fluidbox_index",
  "ignored_by_stats",
  "ignored_by_productivity",
]);

export function extract(input: ExtractInput): ExtractResult {
  const { dump, locale } = input;
  const skipped: string[] = [];

  const machines: Record<string, Machine> = {};
  for (const type of MACHINE_TYPES) {
    for (const [id, raw] of Object.entries(dump[type] ?? {})) {
      if (raw.hidden === true) {
        skipped.push(`machine ${id}: hidden`);
        continue;
      }
      machines[id] = readMachine(id, raw, locale.entity);
    }
  }
  const machineCategories = new Set(Object.values(machines).flatMap((m) => m.categories));

  const recipes: Record<string, Recipe> = {};
  const used = new Map<string, "item" | "fluid">();
  for (const [id, raw] of Object.entries(dump.recipe ?? {})) {
    const why = skipReason(raw);
    if (why) {
      skipped.push(`recipe ${id}: ${why}`);
      continue;
    }
    if ("category" in raw) {
      throw new Error(`recipe ${id} has "category"; this dump is older than Factorio 2.1`);
    }
    const categories = raw.categories === undefined ? DEFAULT_CATEGORIES : strings(raw.categories);
    const missing = categories.filter((c) => !machineCategories.has(c));
    if (missing.length === categories.length) {
      skipped.push(`recipe ${id}: no machine has category ${categories.join(", ")}`);
      continue;
    }
    const ingredients = readAmounts(id, raw.ingredients, INGREDIENT_KEYS, used);
    const products = readAmounts(id, raw.results, RESULT_KEYS, used);
    const time =
      raw.energy_required === undefined ? DEFAULT_TIME : positive(id, raw.energy_required);
    recipes[id] = {
      id,
      name: nameOf("recipe", id, locale.recipe),
      categories: [...categories],
      time,
      ingredients,
      products,
    };
  }

  const items: Record<string, Item> = {};
  for (const [id, kind] of [...used].sort(([a], [b]) => a.localeCompare(b))) {
    items[id] =
      kind === "fluid" ? readFluid(id, dump, locale.fluid) : readItem(id, dump, locale.item);
  }

  return {
    data: {
      factorioVersion: input.factorioVersion,
      mods: [...input.mods],
      items,
      recipes,
      machines,
      belts: readBelts(dump, locale.entity),
    },
    skipped,
  };
}

function skipReason(raw: RawProto): string | null {
  if (raw.parameter === true) return "parameter recipe";
  if (raw.hidden === true) return "hidden";
  if (list(raw.results).length === 0) return "no results";
  return null;
}

function readAmounts(
  recipe: string,
  value: unknown,
  allowed: Set<string>,
  used: Map<string, "item" | "fluid">,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const entry of list(value)) {
    for (const key of Object.keys(entry)) {
      if (!allowed.has(key)) throw new Error(`recipe ${recipe}: unsupported field "${key}"`);
    }
    const name = entry.name;
    const type = entry.type;
    if (typeof name !== "string") throw new Error(`recipe ${recipe}: entry without a name`);
    if (type !== "item" && type !== "fluid") {
      throw new Error(`recipe ${recipe}: ${name} has type ${String(type)}`);
    }
    const seen = used.get(name);
    if (seen && seen !== type) throw new Error(`${name} is used as both item and fluid`);
    used.set(name, type);

    let amount = positive(`${recipe} ${name}`, entry.amount);
    if (entry.probability !== undefined) amount *= fraction(recipe, entry.probability);
    if (entry.shared_probability !== undefined) {
      const sp = entry.shared_probability as { min?: unknown; max?: unknown };
      amount *= fraction(recipe, sp.max) - fraction(recipe, sp.min);
    }
    out[name] = (out[name] ?? 0) + amount;
  }
  return out;
}

function readMachine(id: string, raw: RawProto, names: Names): Machine {
  const source = (raw.energy_source as { type?: unknown } | undefined)?.type;
  if (source !== "burner" && source !== "electric") {
    throw new Error(`machine ${id}: unsupported energy source ${String(source)}`);
  }
  return {
    id,
    name: nameOf("entity", id, names),
    speed: positive(id, raw.crafting_speed),
    categories: strings(raw.crafting_categories),
    size: footprint(id, raw.collision_box),
    burner: source === "burner",
    energyUsage: parseEnergy(String(raw.energy_usage), "W"),
  };
}

/** Tiles covered by a square collision box, e.g. [[-1.2,-1.2],[1.2,1.2]] -> 3. */
function footprint(id: string, box: unknown): number {
  const b = box as [[number, number], [number, number]] | undefined;
  const w = b ? Math.ceil(b[1][0] - b[0][0]) : NaN;
  const h = b ? Math.ceil(b[1][1] - b[0][1]) : NaN;
  if (!(w > 0) || w !== h) throw new Error(`machine ${id}: not a square footprint`);
  return w;
}

function readItem(id: string, dump: RawDump, names: Names): Item {
  const raw = Object.values(dump).find((protos) => protos[id]?.stack_size !== undefined)?.[id];
  if (!raw) throw new Error(`item ${id} is used by a recipe but isn't in the dump`);
  const item: Item = { id, name: nameOf("item", id, names), fluid: false };
  if (raw.fuel_value !== undefined) {
    const fuel = parseEnergy(String(raw.fuel_value), "J");
    if (fuel > 0) item.fuelValue = fuel;
  }
  return item;
}

function readFluid(id: string, dump: RawDump, names: Names): Item {
  if (!dump.fluid?.[id]) throw new Error(`fluid ${id} is used by a recipe but isn't in the dump`);
  return { id, name: nameOf("fluid", id, names), fluid: true };
}

function readBelts(dump: RawDump, names: Names): Record<string, Belt> {
  const sameSpeed = (type: string, speed: number) =>
    Object.values(dump[type] ?? {}).filter((p) => p.hidden !== true && p.speed === speed);
  const belts = Object.values(dump["transport-belt"] ?? {})
    .filter((p) => p.hidden !== true)
    .map((raw) => {
      const id = String(raw.name);
      const speed = positive(id, raw.speed);
      const ug = sameSpeed("underground-belt", speed);
      const sp = sameSpeed("splitter", speed);
      if (ug.length !== 1) throw new Error(`belt ${id}: expected one underground of its speed`);
      if (sp.length !== 1) throw new Error(`belt ${id}: expected one splitter of its speed`);
      const belt: Belt = {
        id,
        name: nameOf("entity", id, names),
        itemsPerSecond: speed * TICKS_PER_SECOND * BELT_ITEMS_PER_TILE,
        underground: String(ug[0]!.name),
        undergroundMaxDistance: positive(id, ug[0]!.max_distance),
        splitter: String(sp[0]!.name),
      };
      return belt;
    })
    .sort((a, b) => a.itemsPerSecond - b.itemsPerSecond);
  return Object.fromEntries(belts.map((b) => [b.id, b]));
}

const UNIT = { "": 1, k: 1e3, M: 1e6, G: 1e9, T: 1e12 } as const;

/** Reads the game's energy strings: "150kW" -> 150000 (watts), "4MJ" -> 4000000 (joules). */
export function parseEnergy(text: string, unit: "W" | "J"): number {
  const m = /^(\d+(?:\.\d+)?)([kMGT]?)([WJ])$/.exec(text);
  if (!m || m[3] !== unit) throw new Error(`can't read "${text}" as an energy in ${unit}`);
  return Number(m[1]) * UNIT[m[2] as keyof typeof UNIT];
}

/** The mods a Factorio run loaded, from lines like "Loading mod base 2.1.24 (data.lua)". */
export function parseLoadedMods(log: string): { name: string; version: string }[] {
  const mods = new Map<string, string>();
  for (const m of log.matchAll(/Loading mod (\S+) (\S+) \(data\.lua\)/g)) {
    if (m[1] !== "core") mods.set(m[1]!, m[2]!);
  }
  if (mods.size === 0) throw new Error("the Factorio log shows no mods loaded");
  return [...mods].map(([name, version]) => ({ name, version }));
}

function nameOf(kind: string, id: string, names: Names): string {
  const name = names[id];
  if (typeof name !== "string" || name === "") throw new Error(`no English name for ${kind} ${id}`);
  return name;
}

/** Lua's empty table dumps as {}, so an empty list can arrive as an object. */
function list(value: unknown): RawProto[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value as RawProto[];
  if (typeof value === "object" && value !== null && Object.keys(value).length === 0) return [];
  throw new Error(`expected a list, got ${JSON.stringify(value)}`);
}

function strings(value: unknown): string[] {
  const l = list(value);
  if (!l.every((s) => typeof s === "string")) throw new Error(`expected strings: ${String(value)}`);
  return l as unknown as string[];
}

function positive(what: string, value: unknown): number {
  if (typeof value !== "number" || !(value > 0) || !Number.isFinite(value)) {
    throw new Error(`${what}: expected a positive number, got ${JSON.stringify(value)}`);
  }
  return value;
}

function fraction(recipe: string, value: unknown): number {
  if (typeof value !== "number" || value < 0 || value > 1) {
    throw new Error(`recipe ${recipe}: bad probability ${JSON.stringify(value)}`);
  }
  return value;
}
