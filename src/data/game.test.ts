// Lookups over data/game-data.json (Factorio 2.1.24, base game). Expected values are the game's,
// as extracted; see gameData.test.ts for the comparison with the old hand-typed tables.
import { describe, expect, it } from "vitest";
import {
  BELTS,
  machine,
  PLANNABLE,
  belt,
  recipesFor,
  unsupported,
  isFluid,
  itemName,
  machinesFor,
  plannedRecipe,
  productOf,
  GAME,
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

  it("plans every item with a game recipe, the artifact's 35 included (#26)", () => {
    for (const id of PLANNABLE) expect(plannedRecipe(id), id).toBeDefined();
    const artifact35 = ["logistic-science-pack", "utility-science-pack", "low-density-structure"];
    for (const id of artifact35) expect(PLANNABLE).toContain(id);
    for (const id of ["rocket-silo", "satellite", "assembling-machine-3", "solid-fuel", "pipe"]) {
      expect(PLANNABLE).toContain(id);
    }
  });

  it("lists plannable items in the game's crafting-menu order", () => {
    const order = (id: string) => {
      const it = GAME.items[id]!;
      return [GAME.groups[it.group]!.order, GAME.subgroups[it.subgroup]!.order, it.order];
    };
    for (let i = 1; i < PLANNABLE.length; i++) {
      const a = order(PLANNABLE[i - 1]!).join("|");
      const b = order(PLANNABLE[i]!).join("|");
      expect(a <= b, `${PLANNABLE[i - 1]} before ${PLANNABLE[i]}`).toBe(true);
    }
    expect(GAME.items[PLANNABLE[0]!]!.group).toBe("logistics");
  });

  it("offers every recipe for an item made several ways, defaulting solid fuel to light oil", () => {
    expect(
      recipesFor("solid-fuel")
        .map((r) => r.id)
        .sort(),
    ).toEqual([
      "solid-fuel-from-heavy-oil",
      "solid-fuel-from-light-oil",
      "solid-fuel-from-petroleum-gas",
    ]);
    expect(plannedRecipe("solid-fuel")!.id).toBe("solid-fuel-from-light-oil");
    expect(plannedRecipe("solid-fuel", "solid-fuel-from-heavy-oil")!.id).toBe(
      "solid-fuel-from-heavy-oil",
    );
    expect(() => plannedRecipe("solid-fuel", "iron-gear-wheel")).toThrow(/solid-fuel/);
  });

  it("never plans with barrel recipes, so fluids stay raw", () => {
    expect(plannedRecipe("water")).toBeUndefined();
    expect(plannedRecipe("crude-oil")).toBeUndefined();
    expect(unsupported("water")).toBeUndefined();
    expect(recipesFor("lubricant").map((r) => r.id)).toEqual(["lubricant"]);
    // The empty barrel is an ordinary item (steel -> barrel), and cliff explosives use one.
    expect(plannedRecipe("barrel")!.id).toBe("barrel");
    expect(PLANNABLE).toContain("cliff-explosives");
  });

  it("says why an item can't be planned", () => {
    expect(unsupported("water-barrel")).toMatch(/barrel/i);
    expect(PLANNABLE).not.toContain("water-barrel");
    for (const id of ["uranium-235", "uranium-fuel-cell", "nuclear-fuel", "atomic-bomb"]) {
      expect(unsupported(id), id).toMatch(/uranium/i);
      expect(PLANNABLE).not.toContain(id);
    }
    expect(unsupported("rocket-part")).toMatch(/launch/i);
    expect(unsupported("iron-gear-wheel")).toBeUndefined();
    expect(unsupported("iron-ore")).toBeUndefined();
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

describe("JavaScript's built-in names", () => {
  for (const k of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) {
    it(`aren't items, machines or belts: ${k}`, () => {
      expect(() => itemName(k)).toThrow(/Unknown item/);
      expect(() => isFluid(k)).toThrow(/Unknown item/);
      expect(() => machine(k)).toThrow(/Unknown machine/);
      expect(() => belt(k)).toThrow(/Unknown belt/);
      expect(plannedRecipe(k)).toBeUndefined();
    });
  }
});
