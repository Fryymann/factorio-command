import { describe, expect, it } from "vitest";
import { bpSolution, resolveBpSettings } from "../blueprint/fromModules.ts";
import type { BpSettings } from "../blueprint/fromModules.ts";
import { planLayout } from "../blueprint/layout.ts";
import { goldens } from "../testdata/goldens.ts";
import type { ModuleGraph } from "../modules/types.ts";
import { startChainEdit, staleWarnings } from "./chainEdit.ts";
import { beltByKey } from "../data/game.ts";
import { edFromLayout } from "./fromLayout.ts";
import { laneSim } from "./laneSim.ts";

function start(name: "green" | "blue" = "green") {
  const bp = resolveBpSettings(undefined, "15");
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
      belt: "15",
      ins: "fast",
      maxRow: 12,
      machines: {
        "logistic-science-pack": { count: 8, mach: "am2" },
        inserter: { count: 1, mach: "am2" },
        "transport-belt": { count: 1, mach: "am2" },
        "iron-gear-wheel": { count: 1, mach: "am2" },
        "electronic-circuit": { count: 1, mach: "am2" },
        "copper-cable": { count: 1, mach: "am2" },
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
    basis.machines["inserter"] = { count: 1, mach: "am2" };
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
          n.kind === "machine" && n.item === "inserter" ? { ...n, mach: "am3" as const } : n,
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
    const bp: BpSettings = { scope: "all", belt: "30", ins: "bulk", maxRow: 8 };
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
    const bp = resolveBpSettings({ maxRow: 4 }, "15");
    const sol = bpSolution(goldens.green.graph, bp);
    const LY = planLayout(sol, bp);
    expect(LY.rows.filter((r) => r.parts === 2)).toHaveLength(2); // the 8 packs, as 4 + 4
    expect(LY.counts.splitter).toBeGreaterThan(0);
    const edit = startChainEdit(LY, sol, bp);
    expect(edit.ents.filter((e) => e.t === "machine")).toHaveLength(LY.counts.machine);
    expect(edit.ents.filter((e) => e.t === "splitter")).toHaveLength(LY.counts.splitter);
    const sim = laneSim(edit.ents, beltByKey(bp.belt).U);
    expect(sim.checks).toEqual([]);
    expect(sim.mixedSet.size).toBe(0);
  });
});
