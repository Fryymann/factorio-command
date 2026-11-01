// Lookups over data/game-data.json (Factorio 2.1.24, base game). Expected values are the game's,
// as extracted; see gameData.test.ts for the comparison with the old hand-typed tables.
import { describe, expect, it } from "vitest";
import {
  BELTS,
  PLANNED,
  belt,
  isFluid,
  itemName,
  machinesFor,
  plannedRecipe,
  productOf,
} from "./game.ts";

describe("plannedRecipe", () => {
  it("returns the game's recipe for a planned item", () => {
    const r = plannedRecipe("iron-gear-wheel")!;
    expect(r.time).toBe(0.5);
    expect(r.ingredients).toEqual({ "iron-plate": 2 });
    expect(productOf(r, "iron-gear-wheel")).toBe(1);
  });

  it("leaves oil products, ores and water as raw inputs", () => {
    expect(plannedRecipe("petroleum-gas")).toBeUndefined();
    expect(plannedRecipe("iron-ore")).toBeUndefined();
    expect(plannedRecipe("water")).toBeUndefined();
  });

  it("plans the same 35 items as the artifact", () => {
    expect(PLANNED).toHaveLength(35);
    for (const id of PLANNED) expect(plannedRecipe(id), id).toBeDefined();
  });

  it("uses the game's piercing rounds recipe, not the artifact's", () => {
    // Factorio 2.0.46 changelog: "Changed piercing ammo recipe to be cheaper." The artifact had
    // the older 3 s; 1 magazine, 1 steel, 5 copper -> 1.
    const r = plannedRecipe("piercing-rounds-magazine")!;
    expect(r.time).toBe(6);
    expect(r.ingredients).toEqual({ "firearm-magazine": 2, "steel-plate": 1, "copper-plate": 2 });
    expect(productOf(r, "piercing-rounds-magazine")).toBe(2);
  });

  it("throws when asked for a product the recipe doesn't make", () => {
    expect(() => productOf(plannedRecipe("iron-gear-wheel")!, "copper-cable")).toThrow();
  });
});

describe("items", () => {
  it("uses the game's names", () => {
    expect(itemName("automation-science-pack")).toBe("Automation science pack");
    expect(() => itemName("nope")).toThrow(/Unknown item "nope"/);
  });

  it("knows which items are fluids", () => {
    expect(isFluid("water")).toBe(true);
    expect(isFluid("iron-plate")).toBe(false);
    expect(() => isFluid("nope")).toThrow();
  });
});

describe("belts", () => {
  it("reads the base belts from the game", () => {
    expect(belt("transport-belt")).toMatchObject({
      itemsPerSecond: 15,
      U: 4,
      underground: "underground-belt",
      splitter: "splitter",
      spaceAge: false,
    });
  });

  it("keeps turbo belt, hand-written and marked Space Age (#11)", () => {
    expect(belt("turbo-transport-belt")).toMatchObject({
      itemsPerSecond: 60,
      U: 10,
      spaceAge: true,
    });
  });

  it("lists tiers slowest first", () => {
    expect(Object.keys(BELTS)).toEqual([
      "transport-belt",
      "fast-transport-belt",
      "express-transport-belt",
      "turbo-transport-belt",
    ]);
    expect(() => belt("15")).toThrow(/Unknown belt "15"/);
  });
});

describe("machinesFor", () => {
  const ids = (item: string) => machinesFor(plannedRecipe(item)!).map((m) => m.id);

  it("finds the machines whose categories match, slowest first", () => {
    expect(ids("sulfur")).toEqual(["chemical-plant"]);
    expect(ids("processing-unit")).toEqual(["assembling-machine-2", "assembling-machine-3"]);
    expect(ids("iron-plate")).toEqual(["stone-furnace", "electric-furnace", "steel-furnace"]);
  });
});
