import { describe, expect, it } from "vitest";
import { bpSolution, resolveBpSettings } from "../blueprint/fromModules.ts";
import type { BpSettings } from "../blueprint/fromModules.ts";
import type { EdEnt } from "./types.ts";
import { planLayout } from "../blueprint/layout.ts";
import { goldens } from "../testdata/goldens.ts";
import type { ModuleGraph } from "../modules/types.ts";
import { makeBasis, moduleEditWarnings, startChainEdit, staleWarnings } from "./chainEdit.ts";
import { belt } from "../data/game.ts";
import { edFromLayout } from "./fromLayout.ts";
import { laneSim } from "./laneSim.ts";

function start(name: "green" | "blue" = "green") {
  const bp = resolveBpSettings(undefined, "transport-belt");
  const sol = bpSolution(goldens[name].graph, bp);
  const LY = planLayout(sol, bp);
  return { bp, sol, LY, edit: startChainEdit(LY, sol, bp) };
}

const withCount = (g: ModuleGraph, item: string, count: number): ModuleGraph => ({
  ...g,
  nodes: g.nodes.map((n) => (n.kind === "machine" && n.item === item ? { ...n, count } : n)),
});

describe("startChainEdit", () => {
  it("copies the generated entities and snapshots the settings and machine counts", () => {
    const { LY, bp, edit } = start();
    expect(edit.ents).toEqual(edFromLayout(LY, bp).ents);
    expect(edit.basis).toEqual({
      belt: "transport-belt",
      ins: "fast",
      maxRow: 12,
      machines: {
        "logistic-science-pack": {
          count: 8,
          mach: "assembling-machine-2",
          recipe: "logistic-science-pack",
        },
        inserter: { count: 1, mach: "assembling-machine-2", recipe: "inserter" },
        "transport-belt": { count: 1, mach: "assembling-machine-2", recipe: "transport-belt" },
        "iron-gear-wheel": { count: 1, mach: "assembling-machine-2", recipe: "iron-gear-wheel" },
        "electronic-circuit": {
          count: 1,
          mach: "assembling-machine-2",
          recipe: "electronic-circuit",
        },
        "copper-cable": { count: 1, mach: "assembling-machine-2", recipe: "copper-cable" },
      },
    });
  });
});

describe("staleWarnings", () => {
  it("is empty when nothing changed", () => {
    const { edit, sol, bp } = start();
    expect(staleWarnings(edit.basis, sol, bp)).toEqual([]);
  });

  it("one machine count change gives exactly one warning naming the item and both counts", () => {
    const { edit, bp } = start();
    const sol = bpSolution(withCount(goldens.green.graph, "logistic-science-pack", 10), bp);
    expect(staleWarnings(edit.basis, sol, bp)).toEqual([
      {
        kind: "count",
        item: "logistic-science-pack",
        text: "Logistic science pack machine count changed from 8 to 10.",
      },
    ]);
  });

  it("reports an item removed from the chain", () => {
    const { edit, bp } = start();
    const g = goldens.green.graph;
    const gone = g.nodes.find((n) => n.kind === "machine" && n.item === "transport-belt")!;
    const sol = bpSolution(
      {
        ...g,
        nodes: g.nodes.filter((n) => n !== gone),
        edges: g.edges.filter((e) => e.from !== gone.id && e.to !== gone.id),
      },
      bp,
    );
    expect(staleWarnings(edit.basis, sol, bp).map((w) => [w.kind, w.item])).toEqual([
      ["removed", "transport-belt"],
    ]);
  });

  it("reports an item added to the chain", () => {
    const { bp, sol } = start();
    const older = start().edit;
    const basis = { ...older.basis, machines: { ...older.basis.machines } };
    delete basis.machines["pipe"];
    basis.machines["inserter"] = { count: 1, mach: "assembling-machine-2" };
    const withPipe = { build: [...sol.build, { ...sol.build[0]!, id: "pipe", count: 2 }] };
    expect(staleWarnings(basis, withPipe, bp)).toEqual([
      { kind: "added", item: "pipe", text: "Pipe was added to the chain (2 machines)." },
    ]);
  });

  it("reports a machine type change", () => {
    const { edit, bp } = start();
    const g = goldens.green.graph;
    const sol = bpSolution(
      {
        ...g,
        nodes: g.nodes.map((n) =>
          n.kind === "machine" && n.item === "inserter"
            ? { ...n, mach: "assembling-machine-3" }
            : n,
        ),
      },
      bp,
    );
    expect(staleWarnings(edit.basis, sol, bp)).toEqual([
      {
        kind: "machine",
        item: "inserter",
        text: "Inserter is now made in Assembling machine 3 instead of Assembling machine 2.",
      },
    ]);
  });

  it("reports belt tier, inserter type and max row changes", () => {
    const { edit, sol } = start();
    const bp: BpSettings = { scope: "all", belt: "fast-transport-belt", ins: "bulk", maxRow: 8 };
    expect(staleWarnings(edit.basis, sol, bp).map((w) => [w.kind, w.text])).toEqual([
      [
        "belt",
        "Belt tier changed from Transport belt to Fast transport belt. Underground reach is different.",
      ],
      ["inserter", "Inserter type changed from Fast inserter to Bulk inserter."],
      ["maxRow", "Maximum row length changed from 12 to 8."],
    ]);
  });
});

describe("chain edit of a multi-row chain", () => {
  // Plan section 2: several rows, a product split over two rows (part/parts), and bus columns
  // with splitters must all come through edFromLayout and still simulate cleanly.
  it("a split product keeps every machine fed and every lane clean", () => {
    const bp = resolveBpSettings({ maxRow: 4 }, "transport-belt");
    const sol = bpSolution(goldens.green.graph, bp);
    const LY = planLayout(sol, bp);
    expect(LY.rows.filter((r) => r.parts === 2)).toHaveLength(2); // the 8 packs, as 4 + 4
    expect(LY.counts.splitter).toBeGreaterThan(0);
    const edit = startChainEdit(LY, sol, bp);
    expect(edit.ents.filter((e) => e.t === "machine")).toHaveLength(LY.counts.machine);
    expect(edit.ents.filter((e) => e.t === "splitter")).toHaveLength(LY.counts.splitter);
    const sim = laneSim(edit.ents, belt(bp.belt).U);
    expect(sim.checks).toEqual([]);
    expect(sim.mixedSet.size).toBe(0);
  });
});

// #26 review: solid fuel's three recipes all take 1 s in a chemical plant, so switching recipe
// changes neither the count nor the machine. An edit made before the switch must still be flagged,
// or the exported blueprint would set the plants to the old recipe.
const fuelEntry = (recipe: string) => ({
  id: "solid-fuel",
  recipe,
  rate: 1,
  depth: 0,
  exact: 1,
  count: 1,
  machine: { name: "Chemical plant", speed: 1, ent: "chemical-plant", size: 3, burner: false },
  mach: "chemical-plant",
});
const fuelBp: BpSettings = { scope: "all", belt: "transport-belt", ins: "fast", maxRow: 12 };

describe("staleWarnings: recipe changes (#26)", () => {
  it("flags a changed recipe, naming both", () => {
    const basis = makeBasis({ build: [fuelEntry("solid-fuel-from-light-oil")] }, fuelBp);
    const w = staleWarnings(basis, { build: [fuelEntry("solid-fuel-from-heavy-oil")] }, fuelBp);
    expect(w).toEqual([
      {
        kind: "recipe",
        item: "solid-fuel",
        text: "Solid fuel is now made with Solid fuel from heavy oil instead of Solid fuel from light oil.",
      },
    ]);
  });

  it("reads a basis saved before recipes were recorded as the default recipe", () => {
    const basis = makeBasis({ build: [fuelEntry("solid-fuel-from-light-oil")] }, fuelBp);
    delete basis.machines["solid-fuel"]!.recipe;
    expect(
      staleWarnings(basis, { build: [fuelEntry("solid-fuel-from-light-oil")] }, fuelBp),
    ).toEqual([]);
    expect(
      staleWarnings(basis, { build: [fuelEntry("solid-fuel-from-heavy-oil")] }, fuelBp).map(
        (x) => x.kind,
      ),
    ).toEqual(["recipe"]);
  });
});

describe("moduleEditWarnings (#26)", () => {
  const plant = (recipe: string | null): EdEnt & { t: "machine" } => ({
    t: "machine",
    x: 0,
    y: 0,
    w: 3,
    h: 3,
    item: "solid-fuel",
    ent: "chemical-plant",
    mname: "Chemical plant",
    recipe,
  });
  const block = (recipe?: string) => ({
    id: "m",
    kind: "machine" as const,
    item: "solid-fuel",
    count: 1,
    mach: "chemical-plant",
    ...(recipe ? { recipe } : {}),
  });

  it("is quiet when the edit matches the block", () => {
    expect(moduleEditWarnings(block(), [plant("solid-fuel-from-light-oil")])).toEqual([]);
  });

  it("flags machines set to a recipe the block no longer uses", () => {
    expect(
      moduleEditWarnings(block("solid-fuel-from-heavy-oil"), [plant("solid-fuel-from-light-oil")]),
    ).toEqual([
      "This module now uses Solid fuel from heavy oil, but the edited layout's machines are set to Solid fuel from light oil. Discard edits to start over.",
    ]);
  });

  it("keeps the count and item checks it had", () => {
    expect(
      moduleEditWarnings({ ...block(), count: 2 }, [plant("solid-fuel-from-light-oil")]),
    ).toEqual([
      "This module now has 2 buildings but the edited layout has 1. Discard edits to start from a fresh layout, or set the count back on the Modules tab.",
    ]);
  });

  it("ignores furnaces, which pick their own recipe", () => {
    const furnace: EdEnt = {
      ...plant(null),
      item: "iron-plate",
      ent: "stone-furnace",
      mname: "Stone furnace",
      w: 2,
      h: 2,
    };
    expect(
      moduleEditWarnings({ ...block(), item: "iron-plate", mach: "stone-furnace" }, [furnace]),
    ).toEqual([]);
  });
});
