import { describe, expect, it } from "vitest";
import { consumption, FLUID_ASM_WARNING, solve, targetRate } from "./solve.ts";
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

  it("throws on unknown input instead of guessing", () => {
    expect(() => solve({ ...base, item: "nope" })).toThrow(/nope/);
    expect(() => solve({ ...base, asm: "9" as never })).toThrow(/assembler/);
    expect(() => solve({ ...base, furn: "lava" as never })).toThrow(/furnace/);
  });
});
