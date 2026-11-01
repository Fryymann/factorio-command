// Checks data/game-data.json (extracted from Factorio 2.1.24, base game) against the hand-typed
// tables in legacy.ts that the planner still runs on. Every difference is listed here on purpose:
// each one is a bug in the old tables or a change in the game, never a silent update.
import { describe, expect, it } from "vitest";
import raw from "../../data/game-data.json" with { type: "json" };
import {
  BELT_TIERS,
  FUEL,
  ITEM_FLUID,
  MACH,
  RECIPES,
  type RecipeKind,
} from "../testdata/legacy-tables.ts";
import type { GameData } from "./types.ts";

const data = raw as GameData;

// Legacy recipe kind -> the game category that must be among the recipe's categories.
const KIND_CATEGORY: Record<RecipeKind, string[]> = {
  craft: ["crafting", "advanced-crafting"],
  fluidcraft: ["crafting-with-fluid"],
  smelt: ["smelting"],
  chem: ["chemistry"],
};

describe("game-data.json", () => {
  it("is Factorio 2.1.24, base game only", () => {
    expect(data.factorioVersion).toBe("2.1.24");
    expect(data.mods).toEqual(["base"]);
  });

  it("agrees with every hand-typed recipe except piercing rounds", () => {
    for (const [id, old] of Object.entries(RECIPES)) {
      if (id === "piercing-rounds-magazine") continue;
      const r = data.recipes[id];
      expect(r, id).toBeDefined();
      expect({ id, time: r!.time, ins: r!.ingredients, out: r!.products }).toEqual({
        id,
        time: old.time,
        ins: old.ins,
        out: { [id]: old.out },
      });
      expect(
        r!.categories.some((c) => KIND_CATEGORY[old.kind].includes(c)),
        `${id} categories ${r!.categories.join(",")} vs kind ${old.kind}`,
      ).toBe(true);
    }
  });

  it("has piercing rounds as 2.1.24 does, which the hand-typed table had wrong", () => {
    // The artifact has the pre-2.0.46 recipe (3 s; 1 magazine, 1 steel, 5 copper -> 1). Factorio
    // 2.0.46's changelog: "Changed piercing ammo recipe to be cheaper."
    expect(RECIPES["piercing-rounds-magazine"]).toMatchObject({
      time: 3,
      out: 1,
      ins: { "firearm-magazine": 1, "steel-plate": 1, "copper-plate": 5 },
    });
    expect(data.recipes["piercing-rounds-magazine"]).toMatchObject({
      time: 6,
      ingredients: { "firearm-magazine": 2, "steel-plate": 1, "copper-plate": 2 },
      products: { "piercing-rounds-magazine": 2 },
    });
  });

  it("agrees with the hand-typed machines", () => {
    for (const old of Object.values(MACH)) {
      const m = data.machines[old.ent];
      expect(m, old.ent).toBeDefined();
      expect({ id: old.ent, speed: m!.speed, size: m!.size, burner: m!.burner }).toEqual({
        id: old.ent,
        speed: old.speed,
        size: old.size,
        burner: old.burner,
      });
      for (const kind of old.kinds) {
        expect(
          m!.categories.some((c) => KIND_CATEGORY[kind].includes(c)),
          `${old.ent} ${kind}`,
        ).toBe(true);
      }
    }
  });

  it("agrees with the hand-typed belt tiers, and has no turbo belt (Space Age only)", () => {
    for (const [key, old] of Object.entries(BELT_TIERS)) {
      const b = data.belts[old.belt];
      if (old.belt === "turbo-transport-belt") {
        expect(b).toBeUndefined();
        continue;
      }
      expect(b, old.belt).toBeDefined();
      expect({
        rate: b!.itemsPerSecond,
        ug: b!.underground,
        sp: b!.splitter,
        U: b!.undergroundMaxDistance - 1,
      }).toEqual({ rate: Number(key), ug: old.ug, sp: old.sp, U: old.U });
    }
  });

  it("gives the hand-typed burner fuel use: stone furnace 90 kW on 4 MJ coal", () => {
    expect(data.machines["stone-furnace"]!.energyUsage / data.items.coal!.fuelValue!).toBe(FUEL);
  });

  it("agrees with the hand-typed fluid flags", () => {
    for (const [id, fluid] of Object.entries(ITEM_FLUID)) {
      expect(data.items[id]?.fluid, id).toBe(fluid);
    }
  });

  it("has a machine for every recipe and an item for every ingredient and product", () => {
    const categories = new Set(Object.values(data.machines).flatMap((m) => m.categories));
    for (const r of Object.values(data.recipes)) {
      expect(
        r.categories.some((c) => categories.has(c)),
        r.id,
      ).toBe(true);
      for (const id of [...Object.keys(r.ingredients), ...Object.keys(r.products)]) {
        expect(data.items[id], `${r.id}: ${id}`).toBeDefined();
      }
    }
  });

  it("has the oil recipes the fluid design (#20) relies on", () => {
    expect(data.recipes["advanced-oil-processing"]).toMatchObject({
      time: 5,
      categories: ["oil-processing"],
      ingredients: { "crude-oil": 100, water: 50 },
      products: { "heavy-oil": 25, "light-oil": 45, "petroleum-gas": 55 },
    });
    expect(data.machines["oil-refinery"]).toMatchObject({ speed: 1, size: 5 });
  });
});
