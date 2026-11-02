import { describe, expect, it } from "vitest";
import { beltUsage, consumption, FLUID_ASM_WARNING, solve, targetRate } from "./solve.ts";
import type { PlanSettings } from "./solve.ts";

const base: PlanSettings = {
  item: "logistic-science-pack",
  amount: 8,
  mode: "buildings",
  asm: "assembling-machine-2",
  furn: "steel-furnace",
  imports: [],
};

// Expected values are worked out from the recipe tables (Factorio wiki, "Logistic science pack":
// 6 s, inserter + transport belt -> 1 pack) and match the numbers the frozen artifact produces
// for the same settings (src/testdata/artifact-goldens.json, "green").
describe("solve: 8 assembling machine 2 of green science", () => {
  const plan = solve(base);
  const row = (id: string) => {
    const r = plan.build.find((b) => b.id === id);
    if (!r) throw new Error(`no row for ${id}`);
    return r;
  };

  it("targets 1 pack/s", () => {
    expect(targetRate(base)).toBeCloseTo(1, 12);
    expect(plan.tree.rate).toBeCloseTo(1, 12);
  });

  it("sizes each stage", () => {
    expect(row("logistic-science-pack").exact).toBeCloseTo(8, 9);
    expect(row("inserter").exact).toBeCloseTo(2 / 3, 9);
    expect(row("transport-belt").exact).toBeCloseTo(1 / 3, 9);
    expect(row("iron-gear-wheel").rate).toBeCloseTo(1.5, 9);
    expect(row("iron-gear-wheel").exact).toBeCloseTo(1, 9);
    expect(row("electronic-circuit").exact).toBeCloseTo(2 / 3, 9);
    expect(row("copper-cable").exact).toBeCloseTo(1, 9);
  });

  it("rounds up, with a tolerance for float noise", () => {
    expect(row("inserter").count).toBe(1);
    expect(row("iron-gear-wheel").exact).toBeCloseTo(1, 9);
    expect(row("iron-gear-wheel").count).toBe(1);
    expect(row("iron-plate").exact).toBeCloseTo(8.8, 9); // 5.5/s * 3.2 s / 2 (steel furnace)
    expect(row("iron-plate").count).toBe(9);
    expect(row("copper-plate").exact).toBeCloseTo(2.4, 9);
    expect(row("copper-plate").count).toBe(3);
  });

  it("orders the build list by depth and totals plates", () => {
    const depths = plan.build.map((b) => b.depth);
    expect(depths).toEqual([...depths].sort((a, b) => a - b));
    expect(consumption(plan.build, "iron-plate")).toBeCloseTo(5.5, 9);
    expect(consumption(plan.build, "copper-plate")).toBeCloseTo(1.5, 9);
  });

  it("lists ore as the only inputs", () => {
    expect([...plan.inputs.keys()].sort()).toEqual(["copper-ore", "iron-ore"]);
    expect(plan.inputs.get("iron-ore")?.rate).toBeCloseTo(5.5, 9);
    expect(plan.inputs.get("iron-ore")?.imported).toBe(false);
    expect(plan.warnings.size).toBe(0);
  });
});

describe("beltUsage", () => {
  // A transport belt carries 15 items/s over two lanes (Factorio wiki, "Transport belts/Physics").
  it("counts lanes and belts for a rate", () => {
    expect(beltUsage(15, "transport-belt")).toEqual({ lanes: 2, belts: 1 });
    expect(beltUsage(7.5, "transport-belt")).toEqual({ lanes: 1, belts: 0.5 });
    expect(beltUsage(90, "turbo-transport-belt")).toEqual({ lanes: 3, belts: 1.5 });
  });

  it("throws on a belt it doesn't know", () => {
    expect(() => beltUsage(1, "15")).toThrow(/Unknown belt "15"/);
  });
});

describe("solve: modes, imports, machines", () => {
  it("rate mode is per second", () => {
    expect(targetRate({ ...base, mode: "rate", amount: 1 })).toBe(1);
    expect(targetRate({ ...base, mode: "rate", amount: 0.25 })).toBe(0.25);
  });

  it("zero is a valid target", () => {
    expect(targetRate({ ...base, amount: 0 })).toBe(0);
    expect(targetRate({ ...base, mode: "rate", amount: 0 })).toBe(0);
  });

  it("throws on negative or non-finite amounts instead of building for zero", () => {
    expect(() => targetRate({ ...base, amount: -3 })).toThrow(/-3/);
    expect(() => targetRate({ ...base, amount: NaN })).toThrow(/NaN/);
    expect(() => targetRate({ ...base, mode: "rate", amount: Infinity })).toThrow(/Infinity/);
    expect(() => solve({ ...base, amount: -1 })).toThrow(/amount/);
  });

  it("an imported plate becomes an input and drops its ore", () => {
    const plan = solve({ ...base, imports: ["iron-plate"] });
    expect(plan.inputs.get("iron-plate")).toEqual({ rate: expect.closeTo(5.5, 9), imported: true });
    expect(plan.inputs.has("iron-ore")).toBe(false);
    expect(plan.build.some((b) => b.id === "iron-plate")).toBe(false);
  });

  it("the final product cannot be imported", () => {
    const plan = solve({ ...base, imports: ["logistic-science-pack"] });
    expect(plan.build.some((b) => b.id === "logistic-science-pack")).toBe(true);
  });

  it("fluid recipes on assembling machine 1 fall back to 2 and warn", () => {
    const plan = solve({
      ...base,
      item: "processing-unit",
      amount: 1,
      asm: "assembling-machine-1",
    });
    expect(plan.warnings).toContain(FLUID_ASM_WARNING);
    const pu = plan.build.find((b) => b.id === "processing-unit");
    expect(pu?.machine.speed).toBe(0.75);
  });

  it("chemical plants run at speed 1 and fluids stay inputs", () => {
    const plan = solve({ ...base, item: "plastic-bar", amount: 2, mode: "rate" });
    // 2 plastic/s, 2 per craft (1 s): 1 craft/s -> 1 plant; 20 gas/s, 1 coal/s.
    expect(plan.build[0]?.exact).toBeCloseTo(1, 9);
    expect(plan.inputs.get("petroleum-gas")?.rate).toBeCloseTo(20, 9);
    expect(plan.inputs.get("coal")?.rate).toBeCloseTo(1, 9);
  });

  it("furnace speed changes the count", () => {
    const plan = solve({ ...base, furn: "stone-furnace" });
    expect(plan.build.find((b) => b.id === "iron-plate")?.exact).toBeCloseTo(17.6, 9);
  });

  it("military science uses the game's piercing rounds recipe", () => {
    // 1 AM2 x 0.75 / 10 s = 0.075 crafts/s (0.15 packs/s). Each craft takes 1 piercing magazine:
    // 0.075/s. Piercing rounds (Factorio 2.1.24): 6 s; 2 firearm magazines, 1 steel, 2 copper -> 2,
    // so 0.0375 crafts/s and 0.075 copper/s. Piercing rounds are military science's only copper
    // user. The artifact's pre-2.0.46 recipe (1 magazine, 1 steel, 5 copper -> 1) gave 0.375/s.
    const plan = solve({ ...base, item: "military-science-pack", amount: 1 });
    const copper = plan.build.find((b) => b.id === "copper-plate")!;
    expect(copper.rate).toBeCloseTo(0.075, 12);
    expect(plan.build.find((b) => b.id === "piercing-rounds-magazine")!.exact).toBeCloseTo(0.3, 9);
  });

  it("uses the plan's recipe choice: solid fuel from light oil by default, or as chosen", () => {
    // Factorio 2.1.24, chemical plant (speed 1), 1 s per craft, 1 solid fuel per craft:
    // from light oil 10 per craft, from heavy oil 20, from petroleum gas 20.
    const fuel = { ...base, item: "solid-fuel", mode: "rate" as const, amount: 1 };
    const light = solve(fuel);
    expect(light.inputs.get("light-oil")?.rate).toBeCloseTo(10, 9);
    expect(light.build[0]?.machine.id).toBe("chemical-plant");
    expect(light.build[0]?.exact).toBeCloseTo(1, 9);
    const heavy = solve({ ...fuel, recipes: { "solid-fuel": "solid-fuel-from-heavy-oil" } });
    expect(heavy.inputs.get("heavy-oil")?.rate).toBeCloseTo(20, 9);
    expect(heavy.inputs.has("light-oil")).toBe(false);
    expect(() => solve({ ...fuel, recipes: { "solid-fuel": "rocket-fuel" } })).toThrow(
      /rocket-fuel/,
    );
  });

  it("plans items the artifact couldn't: 1 assembling machine 3 of rocket silos", () => {
    // Rocket silo, Factorio 2.1.24: 30 s; 1000 concrete, 200 electric engines, 100 pipes,
    // 200 processing units, 1000 steel -> 1. AM3 at speed 1.25: 1/24 silos/s.
    const plan = solve({ ...base, item: "rocket-silo", amount: 1, asm: "assembling-machine-3" });
    expect(plan.tree.rate).toBeCloseTo(1.25 / 30, 12);
    expect(plan.build.find((b) => b.id === "concrete")!.rate).toBeCloseTo((1000 * 1.25) / 30, 9);
  });

  it("throws on unknown input instead of guessing", () => {
    expect(() => solve({ ...base, item: "nope" })).toThrow(/nope/);
    expect(() => solve({ ...base, asm: "9" as never })).toThrow(/assembler/);
    expect(() => solve({ ...base, furn: "lava" as never })).toThrow(/furnace/);
  });
});
