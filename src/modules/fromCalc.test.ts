import { describe, expect, it } from "vitest";
import { solve } from "../solver/solve.ts";
import type { PlanSettings } from "../solver/solve.ts";
import { goldens } from "../testdata/goldens.ts";
import {
  canConnect,
  defaultMach,
  duplicateLayout,
  layoutFromCalc,
  machOptions,
  removeNode,
} from "./fromCalc.ts";

const counter = () => {
  let i = 0;
  return () => `n${i++}`;
};

// The goldens are what the frozen artifact's own `layoutFromCalc` produced (scripts/artifact-goldens.mjs).
const cases: [keyof typeof goldens, PlanSettings][] = [
  [
    "green",
    {
      item: "logistic-science-pack",
      amount: 8,
      mode: "buildings",
      asm: "assembling-machine-2",
      furn: "steel-furnace",
      imports: ["iron-plate", "copper-plate"],
    },
  ],
];

describe("layoutFromCalc matches the artifact", () => {
  for (const [key, s] of cases) {
    it(key, () => {
      const plan = solve(s);
      const L = layoutFromCalc({ plan, ...s, belt: "transport-belt" }, "T", counter());
      const g = goldens[key].graph;
      expect(L.nodes).toEqual(g.nodes);
      expect(L.edges).toEqual(g.edges);
    });
  }

  it("blue science from plates, including fluids", () => {
    const s: PlanSettings = {
      item: "chemical-science-pack",
      amount: 10,
      mode: "buildings",
      asm: "assembling-machine-2",
      furn: "steel-furnace",
      imports: ["iron-plate", "copper-plate", "steel-plate"],
    };
    const L = layoutFromCalc({ plan: solve(s), ...s, belt: "transport-belt" }, "T", counter());
    const g = goldens.blue.graph;
    expect(L.nodes).toEqual(g.nodes);
    expect(L.edges).toEqual(g.edges);
  });
});

describe("machine choice", () => {
  it("defaults follow the calculator settings", () => {
    const s = { asm: "assembling-machine-3", furn: "electric-furnace" } as const;
    expect(defaultMach("iron-plate", s)).toBe("electric-furnace");
    expect(defaultMach("plastic-bar", s)).toBe("chemical-plant");
    expect(defaultMach("inserter", s)).toBe("assembling-machine-3");
  });

  it("fluid recipes never default to assembling machine 1", () => {
    expect(
      defaultMach("processing-unit", { asm: "assembling-machine-1", furn: "steel-furnace" }),
    ).toBe("assembling-machine-2");
  });

  it("offers only buildings that can run the recipe", () => {
    // Slowest first; equal speeds by name (electric before steel furnace).
    expect(machOptions("iron-plate")).toEqual([
      "stone-furnace",
      "electric-furnace",
      "steel-furnace",
    ]);
    expect(machOptions("inserter")).toEqual([
      "assembling-machine-1",
      "assembling-machine-2",
      "assembling-machine-3",
    ]);
    expect(machOptions("processing-unit")).toEqual([
      "assembling-machine-2",
      "assembling-machine-3",
    ]);
    expect(machOptions("sulfur")).toEqual(["chemical-plant"]);
  });

  it("throws for an item with no recipe", () => {
    expect(() => machOptions("iron-ore")).toThrow(/iron-ore/);
  });
});

describe("graph edits", () => {
  const s = cases[0]![1];
  const make = () =>
    layoutFromCalc({ plan: solve(s), ...s, belt: "transport-belt" }, "T", counter());

  it("duplicate remaps every id and keeps the shape", () => {
    const L = make();
    const D = duplicateLayout(L, counter());
    expect(D.name).toBe("T (copy)");
    expect(D.nodes).toHaveLength(L.nodes.length);
    expect(D.edges).toHaveLength(L.edges.length);
    const ids = new Set(D.nodes.map((n) => n.id));
    expect(D.edges.every((e) => ids.has(e.from) && ids.has(e.to))).toBe(true);
    expect(D.needsFit).toBeUndefined();
  });

  it("removing a node removes its belts", () => {
    const L = make();
    removeNode(L, "n2"); // the iron plate source
    expect(L.nodes.some((n) => n.id === "n2")).toBe(false);
    expect(L.edges.some((e) => e.from === "n2" || e.to === "n2")).toBe(false);
  });

  it("canConnect rejects self, sources and duplicates", () => {
    const L = make();
    expect(canConnect(L, "n2", "n2")).toBe(false);
    expect(canConnect(L, "n3", "n1")).toBe(false); // n1 is a source
    expect(canConnect(L, "n2", "n6")).toBe(false); // already connected
    expect(canConnect(L, "n3", "n6")).toBe(true);
    expect(canConnect(L, "n3", "missing")).toBe(false);
  });
});

describe("layoutFromCalc: recipe choices (#26)", () => {
  it("gives a block the plan's recipe when the item has several", () => {
    const s: PlanSettings = {
      item: "solid-fuel",
      amount: 1,
      mode: "buildings",
      asm: "assembling-machine-2",
      furn: "steel-furnace",
      imports: [],
      recipes: { "solid-fuel": "solid-fuel-from-heavy-oil" },
    };
    const L = layoutFromCalc({ plan: solve(s), ...s, belt: "transport-belt" }, "T", counter());
    const block = L.nodes.find((n) => n.kind === "machine" && n.item === "solid-fuel");
    expect(block).toMatchObject({ recipe: "solid-fuel-from-heavy-oil", mach: "chemical-plant" });
  });
});
