import { describe, expect, it } from "vitest";
import { canonHash, goldens } from "../testdata/goldens.ts";
import { bpSolution, resolveBpSettings } from "./fromModules.ts";
import { planLayout } from "./layout.ts";

function plan(
  name: "green" | "blue",
  over: Partial<Parameters<typeof resolveBpSettings>[0] & object> = {},
) {
  const bp = resolveBpSettings(over, "transport-belt");
  return planLayout(bpSolution(goldens[name].graph, bp), bp);
}

describe("planLayout matches the artifact", () => {
  for (const name of ["green", "blue"] as const) {
    it(`${name}: geometry, counts, bus columns and rows`, () => {
      const LY = plan(name);
      const g = goldens[name].layout;
      expect({ W: LY.W, H: LY.H, xb: LY.xb, jxA: LY.jxA, rowX0: LY.rowX0 }).toEqual({
        W: g.W,
        H: g.H,
        xb: g.xb,
        jxA: g.jxA,
        rowX0: g.rowX0,
      });
      expect(LY.counts).toEqual(g.counts);
      expect(LY.warn).toEqual(g.warn);
      expect(LY.conflicts).toBe(g.conflicts);
      expect(LY.pairs).toHaveLength(g.pairs);
      expect(LY.cols.map((c) => [c.item, c.x, c.raw, c.rate, c.end])).toEqual(g.cols);
      expect(LY.rows.map((r) => [r.id, r.n, r.part, r.parts, r.T, r.bottom, r.rowWarn])).toEqual(
        g.rows,
      );
    });

    it(`${name}: every entity is identical to the artifact's`, () => {
      const LY = plan(name);
      expect(LY.ents).toHaveLength(goldens[name].layout.nEnts);
      expect(canonHash(LY.ents)).toBe(goldens[name].layout.entsHash);
    });
  }

  it("green science: the layout has the machines the build list asks for", () => {
    // 8 AM2 for the pack + 5 intermediates, one each (see fromModules.test.ts)
    const LY = plan("green");
    expect(LY.counts.machine).toBe(13);
    expect(LY.rows.map((r) => r.id)).toEqual([
      "copper-cable",
      "electronic-circuit",
      "iron-gear-wheel",
      "inserter",
      "transport-belt",
      "logistic-science-pack",
    ]);
    // raw plates first, then one column per solid product: 2 raw + 6 products
    expect(LY.cols.map((c) => c.item)).toEqual([
      "copper-plate",
      "iron-plate",
      "copper-cable",
      "electronic-circuit",
      "iron-gear-wheel",
      "inserter",
      "transport-belt",
      "logistic-science-pack",
    ]);
  });

  it("blue science: fluids are drawn as pipe guides, not belts", () => {
    expect(plan("blue").counts.pipe).toBe(12);
  });

  it("fails loudly on an unknown belt tier", () => {
    const bp = resolveBpSettings({ belt: "7" }, "transport-belt");
    expect(() =>
      planLayout(
        bpSolution(goldens.green.graph, resolveBpSettings(undefined, "transport-belt")),
        bp,
      ),
    ).toThrow(/Unknown belt "7"/);
  });

  it("splits a row that would overload a belt lane (maxRow)", () => {
    const LY = plan("green", { maxRow: 4 });
    const packRows = LY.rows.filter((r) => r.id === "logistic-science-pack");
    expect(packRows.map((r) => r.n)).toEqual([4, 4]);
    expect(packRows.map((r) => r.part)).toEqual([0, 1]);
  });
});

describe("planLayout: a chosen recipe (#26)", () => {
  it("writes the chosen recipe's id on the machines, not the item's", () => {
    // Solid fuel has no recipe called "solid-fuel"; a blueprint naming one would be broken.
    const sol = {
      build: [
        {
          id: "solid-fuel",
          recipe: "solid-fuel-from-heavy-oil",
          rate: 1,
          depth: 0,
          exact: 1,
          count: 1,
          machine: {
            name: "Chemical plant",
            speed: 1,
            ent: "chemical-plant",
            size: 3,
            burner: false,
          },
          mach: "chemical-plant",
        },
      ],
      inputs: new Map([["heavy-oil", { rate: 20 }]]),
    };
    const LY = planLayout(sol, { belt: "transport-belt", ins: "fast", maxRow: 12 });
    const machines = LY.ents.filter((e) => e.t === "machine");
    expect(machines.map((m) => m.t === "machine" && m.recipe)).toEqual([
      "solid-fuel-from-heavy-oil",
    ]);
  });
});
