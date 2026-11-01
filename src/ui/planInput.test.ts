import { describe, expect, it } from "vitest";
import { beltUsage, solve } from "../solver/solve.ts";
import { planSettings } from "./planInput.ts";
import { DEFAULT_STATE, parseState } from "./storage.ts";
import type { CalcState } from "./storage.ts";

const at = (amount: CalcState["amount"], mode: CalcState["mode"] = "buildings") =>
  planSettings({ ...DEFAULT_STATE, amount, mode });

const amountOf = (r: ReturnType<typeof planSettings>): number => {
  if (!r.ok) throw new Error(r.error);
  return r.settings.amount;
};

// Review Focus 1 (docs/game-data-switchover-plan.md): a calculator save written by the artifact
// plans the same as before, end to end.
describe("an artifact fcp-state, through the migration to a plan", () => {
  it("8 assembling machine 3 of green science on stone furnaces and express belts", () => {
    const saved = JSON.stringify({
      item: "logistic-science-pack",
      amount: 8,
      mode: "buildings",
      asm: "1.25",
      furn: "stone",
      belt: "45",
      unit: "60",
      imports: [],
    });
    const { state, error } = parseState(saved);
    expect(error).toBeUndefined();
    const r = planSettings(state);
    if (!r.ok) throw new Error(r.error);
    const plan = solve(r.settings);
    // 8 x 1.25 / 6 s = 1.6667 packs/s; iron: 5.5 per pack -> 9.1667/s; stone furnace 3.2 s at speed 1.
    expect(plan.tree.rate).toBeCloseTo(10 / 6, 12);
    expect(plan.build.find((b) => b.id === "iron-plate")!.exact).toBeCloseTo((55 / 6) * 3.2, 9);
    const ore = plan.inputs.get("iron-ore")!.rate;
    expect(beltUsage(ore, state.belt)).toEqual({ lanes: ore / 22.5, belts: ore / 45 });
  });
});

describe("planSettings", () => {
  it("passes a building count through", () => {
    expect(amountOf(at(8))).toBe(8);
    expect(amountOf(at("8"))).toBe(8);
    expect(amountOf(at(" 2.5 "))).toBe(2.5);
  });

  it("converts a per-minute rate to per second", () => {
    expect(amountOf(at("60", "rate"))).toBe(1);
    expect(amountOf(at(90, "rate"))).toBe(1.5);
  });

  it("accepts zero", () => {
    expect(amountOf(at("0"))).toBe(0);
    expect(amountOf(at(0, "rate"))).toBe(0);
  });

  it("rejects empty, junk and negative amounts instead of solving for zero", () => {
    expect(at("")).toEqual({ ok: false, error: "Enter a target amount." });
    expect(at("  ")).toEqual({ ok: false, error: "Enter a target amount." });
    expect(at("abc")).toEqual({ ok: false, error: `"abc" isn't a number. Enter a target amount.` });
    expect(at("Infinity", "rate").ok).toBe(false);
    expect(at(-3)).toEqual({ ok: false, error: "The target amount can't be negative." });
  });

  it("drops the UI-only fields", () => {
    const r = planSettings({ ...DEFAULT_STATE, imports: ["iron-plate"] });
    expect(r).toEqual({
      ok: true,
      settings: {
        item: "logistic-science-pack",
        amount: 8,
        mode: "buildings",
        asm: "assembling-machine-2",
        furn: "steel-furnace",
        imports: ["iron-plate"],
      },
    });
  });

  // Plastic bar: 1 s, 1 coal + 20 petroleum gas -> 2 bars, in a chemical plant (speed 1).
  // 120/min is 2/s, so 1 plant.
  it("feeds the solver per-second rates", () => {
    const r = planSettings({ ...DEFAULT_STATE, item: "plastic-bar", amount: "120", mode: "rate" });
    if (!r.ok) throw new Error(r.error);
    const plan = solve(r.settings);
    expect(plan.tree.rate).toBeCloseTo(2, 12);
    expect(plan.build[0]?.exact).toBeCloseTo(1, 9);
  });
});
