import { describe, expect, it } from "vitest";
import {
  extract,
  parseEnergy,
  parseLoadedMods,
  type ExtractInput,
  type RawDump,
} from "./extract.ts";

// Excerpts from Factorio 2.1.24's base-game data dump (factorio --dump-data), trimmed to the
// fields the extractor reads. Values are copied unchanged.
function sampleDump(): RawDump {
  return {
    recipe: {
      // No energy_required and no categories: the game's defaults (0.5 s, "crafting") apply.
      "copper-cable": {
        name: "copper-cable",
        ingredients: [{ type: "item", name: "copper-plate", amount: 1 }],
        results: [{ type: "item", name: "copper-cable", amount: 2 }],
      },
      "piercing-rounds-magazine": {
        name: "piercing-rounds-magazine",
        energy_required: 6,
        ingredients: [
          { type: "item", name: "firearm-magazine", amount: 2 },
          { type: "item", name: "steel-plate", amount: 1 },
          { type: "item", name: "copper-plate", amount: 2 },
        ],
        results: [{ type: "item", name: "piercing-rounds-magazine", amount: 2 }],
      },
      "advanced-oil-processing": {
        name: "advanced-oil-processing",
        categories: ["oil-processing"],
        energy_required: 5,
        ingredients: [
          { type: "fluid", name: "water", amount: 50 },
          { type: "fluid", name: "crude-oil", amount: 100 },
        ],
        results: [
          { type: "fluid", name: "heavy-oil", amount: 25 },
          { type: "fluid", name: "light-oil", amount: 45 },
          { type: "fluid", name: "petroleum-gas", amount: 55 },
        ],
      },
      "coal-liquefaction": {
        name: "coal-liquefaction",
        categories: ["oil-processing"],
        energy_required: 5,
        ingredients: [
          { type: "item", name: "coal", amount: 10 },
          { type: "fluid", name: "heavy-oil", amount: 25, ignored_by_stats: 25 },
          { type: "fluid", name: "steam", amount: 50 },
        ],
        results: [
          {
            type: "fluid",
            name: "heavy-oil",
            amount: 90,
            ignored_by_stats: 25,
            ignored_by_productivity: 25,
          },
          { type: "fluid", name: "light-oil", amount: 20 },
          { type: "fluid", name: "petroleum-gas", amount: 10 },
        ],
      },
      "uranium-processing": {
        name: "uranium-processing",
        categories: ["centrifuging"],
        energy_required: 12,
        ingredients: [{ type: "item", name: "uranium-ore", amount: 10 }],
        results: [
          {
            type: "item",
            name: "uranium-235",
            shared_probability: { min: 0, max: 0.007000000000000001 },
            amount: 1,
          },
          {
            type: "item",
            name: "uranium-238",
            shared_probability: { min: 0.007000000000000001, max: 1 },
            amount: 1,
          },
        ],
      },
      // Not real recipes for planning: skipped, and reported.
      "recipe-unknown": { name: "recipe-unknown", hidden: true, ingredients: {}, results: {} },
      pistol: {
        name: "pistol",
        hidden: true,
        energy_required: 5,
        ingredients: [
          { type: "item", name: "copper-plate", amount: 5 },
          { type: "item", name: "iron-plate", amount: 5 },
        ],
        results: [{ type: "item", name: "pistol", amount: 1 }],
      },
      "parameter-0": { name: "parameter-0", parameter: true, categories: ["parameters"] },
      "rocket-part": {
        name: "rocket-part",
        energy_required: 3,
        categories: ["rocket-building"],
        ingredients: [{ type: "item", name: "processing-unit", amount: 10 }],
        results: [{ type: "item", name: "rocket-part", amount: 1 }],
      },
    },
    "assembling-machine": {
      "assembling-machine-2": {
        name: "assembling-machine-2",
        crafting_speed: 0.75,
        crafting_categories: ["crafting", "advanced-crafting", "crafting-with-fluid"],
        collision_box: [
          [-1.2, -1.2],
          [1.2, 1.2],
        ],
        energy_source: { type: "electric" },
        energy_usage: "150kW",
      },
      "oil-refinery": {
        name: "oil-refinery",
        crafting_speed: 1,
        crafting_categories: ["oil-processing"],
        collision_box: [
          [-2.2, -2.2],
          [2.2, 2.2],
        ],
        energy_source: { type: "electric" },
        energy_usage: "420kW",
      },
      centrifuge: {
        name: "centrifuge",
        crafting_speed: 1,
        crafting_categories: ["centrifuging"],
        collision_box: [
          [-1.2, -1.2],
          [1.2, 1.2],
        ],
        energy_source: { type: "electric" },
        energy_usage: "350kW",
      },
    },
    furnace: {
      "stone-furnace": {
        name: "stone-furnace",
        crafting_speed: 1,
        crafting_categories: ["smelting"],
        collision_box: [
          [-0.7, -0.7],
          [0.7, 0.7],
        ],
        energy_source: { type: "burner", effectivity: 1 },
        energy_usage: "90kW",
      },
    },
    item: {
      coal: { name: "coal", stack_size: 50, fuel_value: "4MJ" },
      "copper-plate": { name: "copper-plate", stack_size: 100 },
      "copper-cable": { name: "copper-cable", stack_size: 200 },
      "steel-plate": { name: "steel-plate", stack_size: 100 },
      "uranium-ore": { name: "uranium-ore", stack_size: 50 },
      "uranium-235": { name: "uranium-235", stack_size: 100 },
      "uranium-238": { name: "uranium-238", stack_size: 100 },
      "iron-plate": { name: "iron-plate", stack_size: 100 },
    },
    ammo: {
      "firearm-magazine": { name: "firearm-magazine", stack_size: 200 },
      "piercing-rounds-magazine": { name: "piercing-rounds-magazine", stack_size: 200 },
    },
    gun: { pistol: { name: "pistol", stack_size: 5 } },
    fluid: {
      water: { name: "water" },
      steam: { name: "steam" },
      "crude-oil": { name: "crude-oil" },
      "heavy-oil": { name: "heavy-oil" },
      "light-oil": { name: "light-oil" },
      "petroleum-gas": { name: "petroleum-gas" },
    },
    "transport-belt": {
      "fast-transport-belt": { name: "fast-transport-belt", speed: 0.0625 },
      "transport-belt": { name: "transport-belt", speed: 0.03125 },
    },
    "underground-belt": {
      "underground-belt": { name: "underground-belt", speed: 0.03125, max_distance: 5 },
      "fast-underground-belt": { name: "fast-underground-belt", speed: 0.0625, max_distance: 7 },
    },
    splitter: {
      splitter: { name: "splitter", speed: 0.03125 },
      "fast-splitter": { name: "fast-splitter", speed: 0.0625 },
    },
  };
}

const names = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, `Name of ${id}`]));

function sampleInput(dump = sampleDump()): ExtractInput {
  return {
    dump,
    locale: {
      item: names(Object.keys({ ...dump.item, ...dump.ammo, ...dump.gun })),
      fluid: names(Object.keys(dump.fluid ?? {})),
      entity: names([
        "assembling-machine-2",
        "oil-refinery",
        "centrifuge",
        "stone-furnace",
        "transport-belt",
        "fast-transport-belt",
      ]),
      recipe: names(Object.keys(dump.recipe ?? {})),
    },
    factorioVersion: "2.1.24",
    mods: ["base"],
  };
}

describe("extract: recipes", () => {
  const { data } = extract(sampleInput());

  it("applies the game's defaults: 0.5 s and the crafting category", () => {
    expect(data.recipes["copper-cable"]).toEqual({
      id: "copper-cable",
      name: "Name of copper-cable",
      categories: ["crafting"],
      time: 0.5,
      ingredients: { "copper-plate": 1 },
      products: { "copper-cable": 2 },
    });
  });

  it("reads piercing rounds as 2.1.24 has them: 6 s, 2 magazines + 1 steel + 2 copper -> 2", () => {
    const r = data.recipes["piercing-rounds-magazine"]!;
    expect(r.time).toBe(6);
    expect(r.ingredients).toEqual({ "firearm-magazine": 2, "steel-plate": 1, "copper-plate": 2 });
    expect(r.products).toEqual({ "piercing-rounds-magazine": 2 });
  });

  it("keeps every product of a multi-product recipe", () => {
    expect(data.recipes["advanced-oil-processing"]!.products).toEqual({
      "heavy-oil": 25,
      "light-oil": 45,
      "petroleum-gas": 55,
    });
  });

  it("lists an item on both sides in full when a recipe consumes what it makes", () => {
    const r = data.recipes["coal-liquefaction"]!;
    expect(r.ingredients["heavy-oil"]).toBe(25);
    expect(r.products["heavy-oil"]).toBe(90);
  });

  it("uses the expected amount for chance-based results", () => {
    const p = data.recipes["uranium-processing"]!.products;
    expect(p["uranium-235"]).toBeCloseTo(0.007, 12);
    expect(p["uranium-238"]).toBeCloseTo(0.993, 12);
  });

  it("skips hidden, parameter and empty recipes, and says which", () => {
    const { data, skipped } = extract(sampleInput());
    for (const id of ["recipe-unknown", "pistol", "parameter-0"]) {
      expect(data.recipes[id]).toBeUndefined();
      expect(skipped.some((s) => s.startsWith(`recipe ${id}:`))).toBe(true);
    }
  });

  it("skips a recipe no extracted machine can make, and says which", () => {
    const { data, skipped } = extract(sampleInput());
    expect(data.recipes["rocket-part"]).toBeUndefined();
    expect(skipped).toContain("recipe rocket-part: no machine has category rocket-building");
  });

  it("throws on a result field it doesn't understand", () => {
    const dump = sampleDump();
    dump.recipe!["copper-cable"]!.results = [
      { type: "item", name: "copper-cable", amount_min: 1, amount_max: 3 },
    ];
    expect(() => extract(sampleInput(dump))).toThrow(/copper-cable.*amount_min/);
  });

  it("throws when the locale has no name for a recipe", () => {
    const input = sampleInput();
    delete input.locale.recipe["copper-cable"];
    expect(() => extract(input)).toThrow(/no English name for recipe copper-cable/);
  });
});

describe("extract: items, machines and belts", () => {
  const { data } = extract(sampleInput());

  it("includes only items that kept recipes use, with fluids marked", () => {
    expect(Object.keys(data.items).sort()).toEqual(
      [
        "coal",
        "copper-cable",
        "copper-plate",
        "crude-oil",
        "firearm-magazine",
        "heavy-oil",
        "light-oil",
        "petroleum-gas",
        "piercing-rounds-magazine",
        "steam",
        "steel-plate",
        "uranium-235",
        "uranium-238",
        "uranium-ore",
        "water",
      ].sort(),
    );
    expect(data.items["petroleum-gas"]).toEqual({
      id: "petroleum-gas",
      name: "Name of petroleum-gas",
      fluid: true,
    });
  });

  it("reads fuel values in joules", () => {
    expect(data.items.coal!.fuelValue).toBe(4_000_000);
    expect(data.items["copper-plate"]!.fuelValue).toBeUndefined();
  });

  it("reads machines: speed, categories, footprint, power", () => {
    expect(data.machines["assembling-machine-2"]).toEqual({
      id: "assembling-machine-2",
      name: "Name of assembling-machine-2",
      speed: 0.75,
      categories: ["crafting", "advanced-crafting", "crafting-with-fluid"],
      size: 3,
      burner: false,
      energyUsage: 150_000,
    });
    expect(data.machines["stone-furnace"]).toMatchObject({ size: 2, burner: true, speed: 1 });
    expect(data.machines["oil-refinery"]!.size).toBe(5);
  });

  it("groups belts into tiers by speed, slowest first", () => {
    expect(Object.values(data.belts)).toEqual([
      {
        id: "transport-belt",
        name: "Name of transport-belt",
        itemsPerSecond: 15,
        underground: "underground-belt",
        undergroundMaxDistance: 5,
        splitter: "splitter",
      },
      {
        id: "fast-transport-belt",
        name: "Name of fast-transport-belt",
        itemsPerSecond: 30,
        underground: "fast-underground-belt",
        undergroundMaxDistance: 7,
        splitter: "fast-splitter",
      },
    ]);
  });

  it("throws when a belt has no underground of the same speed", () => {
    const dump = sampleDump();
    delete dump["underground-belt"]!["fast-underground-belt"];
    expect(() => extract(sampleInput(dump))).toThrow(/fast-transport-belt.*underground/);
  });

  it("passes the version and mod list through", () => {
    expect(data.factorioVersion).toBe("2.1.24");
    expect(data.mods).toEqual(["base"]);
  });
});

describe("parseEnergy", () => {
  it("reads the game's energy strings", () => {
    expect(parseEnergy("75kW", "W")).toBe(75_000);
    expect(parseEnergy("4MJ", "J")).toBe(4_000_000);
    expect(parseEnergy("100MJ", "J")).toBe(100_000_000);
    expect(parseEnergy("2.5kW", "W")).toBe(2_500);
  });

  it("throws on anything else", () => {
    expect(() => parseEnergy("75kJ", "W")).toThrow();
    expect(() => parseEnergy("fast", "W")).toThrow();
  });
});

describe("parseLoadedMods", () => {
  it("reads the mods from Factorio's log, without core", () => {
    // Lines from factorio-current.log of a base-only 2.1.24 run.
    const log = [
      "   0.176 Loading mod core 0.0.0 (data.lua)",
      "   0.245 Loading mod base 2.1.24 (data.lua)",
      "   1.096 Loading mod base 2.1.24 (data-updates.lua)",
    ].join("\n");
    expect(parseLoadedMods(log)).toEqual([{ name: "base", version: "2.1.24" }]);
  });

  it("throws when the log shows no mods", () => {
    expect(() => parseLoadedMods("Factorio initialised")).toThrow(/no mods/);
  });
});
