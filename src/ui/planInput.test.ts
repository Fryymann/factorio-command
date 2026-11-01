import { describe, expect, it } from "vitest";
import { solve } from "../solver/solve.ts";
import { planSettings } from "./planInput.ts";
import { DEFAULT_STATE } from "./storage.ts";
import type { CalcState } from "./storage.ts";

const at = (amount: CalcState["amount"], mode: CalcState["mode"] = "buildings") =>
  planSettings({ ...DEFAULT_STATE, amount, mode });

const amountOf = (r: ReturnType<typeof planSettings>): number => {
  if (!r.ok) throw new Error(r.error);
  return r.settings.amount;
};

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
