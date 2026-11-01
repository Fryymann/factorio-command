import { describe, expect, it } from "vitest";
import { migrateMach } from "../data/savedKeys.ts";
import { goldens } from "../testdata/goldens.ts";
import { bpSolution, resolveBpSettings } from "./fromModules.ts";

describe("bpSolution matches the artifact", () => {
  for (const name of ["green", "blue"] as const) {
    const g = goldens[name];
    it(`${name}: build list, inputs and labels`, () => {
      const sol = bpSolution(g.graph, resolveBpSettings(undefined, "transport-belt"));
      expect(
        sol.build.map((b) => ({
          id: b.id,
          rate: b.rate,
          depth: b.depth,
          exact: b.exact,
          count: b.count,
          mach: b.mach,
        })),
      ).toEqual(g.solBuild.map((b) => ({ ...b, mach: migrateMach(b.mach) })));
      expect([...sol.inputs].map(([k, v]) => [k, v.rate])).toEqual(g.solInputs);
      expect({ title: sol.title, icon: sol.icon, label: sol.label, warn: sol.warn }).toEqual(
        g.solMeta,
      );
    });
  }

  it("green science: 8 AM2 for the pack, 1 each for the intermediates", () => {
    // 1 pack/s needs 8 AM2; every intermediate rounds up to one machine (see simulate.test.ts).
    const sol = bpSolution(goldens.green.graph, resolveBpSettings(undefined, "transport-belt"));
    const counts = Object.fromEntries(sol.build.map((b) => [b.id, b.count]));
    expect(counts).toEqual({
      "logistic-science-pack": 8,
      inserter: 1,
      "transport-belt": 1,
      "iron-gear-wheel": 1,
      "electronic-circuit": 1,
      "copper-cable": 1,
    });
    expect(sol.build.find((b) => b.id === "logistic-science-pack")!.depth).toBe(0);
    expect(sol.build.find((b) => b.id === "copper-cable")!.depth).toBe(3);
  });

  it("a single-module scope returns just that machine and its inputs", () => {
    const g = goldens.green.graph;
    const node = g.nodes.find((n) => n.kind === "machine" && n.item === "inserter")!;
    const sol = bpSolution(g, resolveBpSettings({ scope: node.id }, "transport-belt"));
    expect(sol.build.map((b) => b.id)).toEqual(["inserter"]);
    expect(sol.title).toBe("Module · 1× Inserter");
    expect(sol.label).toBe("Inserter module");
    // 1 inserter/s: 1 circuit, 1 gear, 1 plate per second (recipe per the wiki)
    expect(Object.fromEntries([...sol.inputs].map(([k, v]) => [k, v.rate]))).toEqual({
      "electronic-circuit": 1,
      "iron-gear-wheel": 1,
      "iron-plate": 1,
    });
  });

  it("labels a module with the game's item name", () => {
    // The game calls it "Logistic science pack"; the artifact said "Logistic science (green)" and
    // cut the colour off, giving "Logistic science module".
    const g = goldens.green.graph;
    const node = g.nodes.find((n) => n.kind === "machine" && n.item === "logistic-science-pack")!;
    const sol = bpSolution(g, resolveBpSettings({ scope: node.id }, "transport-belt"));
    expect(sol.label).toBe("Logistic science pack module");
    expect(sol.title).toBe("Module · 8× Logistic science pack");
  });

  it("an unknown scope falls back to the whole chain", () => {
    const sol = bpSolution(
      goldens.green.graph,
      resolveBpSettings({ scope: "gone" }, "transport-belt"),
    );
    expect(sol.build).toHaveLength(6);
  });
});
