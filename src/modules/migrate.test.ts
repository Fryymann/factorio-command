// fcp-layouts written before the switch to game data name machines "am2" and belts "15". The
// golden graphs are exactly that: layouts the artifact itself built.
import { describe, expect, it } from "vitest";
import { bpSolution, resolveBpSettings } from "../blueprint/fromModules.ts";
import { GAME } from "../data/game.ts";
import { staleWarnings } from "../editor/chainEdit.ts";
import { goldens } from "../testdata/goldens.ts";
import { migrateLayouts } from "./migrate.ts";
import { LAYOUTS_KEY, loadLayouts, saveLayouts } from "./storage.ts";
import type { KeyValueStore } from "./storage.ts";

function memory(initial?: string): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>(initial === undefined ? [] : [[LAYOUTS_KEY, initial]]);
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

/** A whole fcp-layouts value as the artifact wrote it: no version, artifact keys. */
const artifactStore = (name: "green" | "blue", extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    layouts: { L1: { id: "L1", ...goldens[name].artifactGraph, bp: { belt: "15" }, ...extra } },
    order: ["L1"],
    current: "L1",
  });

const loaded = (raw: string) => {
  const r = loadLayouts(memory(raw));
  if (!r.ok) throw new Error(r.error);
  return r.state!.layouts.L1!;
};

describe("layouts saved by the artifact", () => {
  for (const name of ["green", "blue"] as const) {
    it(`${name}: load with entity names and plan the same as the artifact`, () => {
      const L = loaded(artifactStore(name));
      const machines = L.nodes.flatMap((n) => (n.kind === "machine" ? [n.mach] : []));
      expect(machines.length).toBeGreaterThan(0);
      expect(machines.every((m) => GAME.machines[m] !== undefined)).toBe(true);
      expect(machines).toContain("assembling-machine-2");
      expect(L.edges.every((e) => e.belt === "transport-belt")).toBe(true);
      expect(L.bp).toEqual({ belt: "transport-belt" });
      // Same numbers as the artifact (src/testdata/artifact-goldens.json).
      const sol = bpSolution(L, resolveBpSettings(L.bp, "transport-belt"));
      expect(sol.build.map((b) => [b.id, b.rate, b.exact, b.count])).toEqual(
        goldens[name].solBuild.map((b) => [b.id, b.rate, b.exact, b.count]),
      );
    });
  }

  it("reads a belt saved as a number like one saved as text", () => {
    const g = goldens.green.artifactGraph;
    const edges = g.edges.map((e, i) => (i === 0 ? { ...e, belt: 30 } : e));
    const L = loaded(artifactStore("green", { edges }));
    expect(L.edges[0]!.belt).toBe("fast-transport-belt");
  });

  it("treats a missing belt as the transport belt, as the artifact's simulation did", () => {
    const g = goldens.green.artifactGraph;
    const edges = g.edges.map((e, i) => (i === 0 ? { ...e, belt: "" } : e));
    expect(loaded(artifactStore("green", { edges })).edges[0]!.belt).toBe("transport-belt");
  });

  it("migrates a saved whole-chain edit, so it doesn't report changes that didn't happen", () => {
    const machines = Object.fromEntries(
      goldens.green.solBuild.map((b) => [b.id, { count: b.count, mach: b.mach }]),
    );
    const chainEdit = { ents: [], basis: { belt: "15", ins: "fast", maxRow: 12, machines } };
    const L = loaded(artifactStore("green", { chainEdit }));
    expect(L.chainEdit!.basis.belt).toBe("transport-belt");
    expect(L.chainEdit!.basis.machines["logistic-science-pack"]!.mach).toBe("assembling-machine-2");
    const bp = resolveBpSettings(L.bp, "transport-belt");
    expect(staleWarnings(L.chainEdit!.basis, bpSolution(L, bp), bp)).toEqual([]);
  });

  it("refuses a layout with a machine it doesn't know, naming it, and leaves storage alone", () => {
    const g = goldens.green.artifactGraph;
    const nodes = g.nodes.map((n) => (n.kind === "machine" ? { ...n, mach: "am9" } : n));
    const raw = artifactStore("green", { nodes, name: "My mall" });
    const kv = memory(raw);
    const r = loadLayouts(kv);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/My mall/);
    expect(!r.ok && r.error).toMatch(/"am9"/);
    expect(kv.data.get(LAYOUTS_KEY)).toBe(raw);
  });
});

describe("items the game data doesn't have", () => {
  it("refuse the load, naming the item, instead of breaking the Modules tab", () => {
    const g = goldens.green.artifactGraph;
    const nodes = g.nodes.map((n) => (n.kind === "source" ? { ...n, item: "unobtainium" } : n));
    const r = loadLayouts(memory(artifactStore("green", { nodes, name: "Odd" })));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/Odd/);
    expect(!r.ok && r.error).toMatch(/"unobtainium"/);
  });
});

describe("the inserter type a layout's blueprint settings name (#33)", () => {
  const g = goldens.green.artifactGraph;
  it.each(["basic", "fast", "bulk"])("keeps %s, the artifact's three choices", (ins) => {
    const L = loaded(artifactStore("green", { bp: { belt: "15", ins } }));
    expect(L.bp).toEqual({ belt: "transport-belt", ins });
  });

  it("leaves a missing one missing, so the default still applies", () => {
    const L = loaded(artifactStore("green", { bp: { belt: "15" } }));
    expect(L.bp).toEqual({ belt: "transport-belt" });
    expect(resolveBpSettings(L.bp, "transport-belt").ins).toBe("fast");
  });

  it("refuses an unknown one, naming the layout and the value, and leaves storage alone", () => {
    const raw = artifactStore("green", { bp: { ins: "stack" }, name: "My mall" });
    const kv = memory(raw);
    const r = loadLayouts(kv);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/Layout "My mall" names an inserter .*"stack"/);
    expect(!r.ok && r.error).toMatch(/left untouched/);
    expect(kv.data.get(LAYOUTS_KEY)).toBe(raw);
  });

  it.each(["", "long", "constructor", "__proto__", 7, null])("refuses %j", (ins) => {
    const raw = artifactStore("green", { bp: { ins } });
    expect(loadLayouts(memory(raw)).ok).toBe(false);
  });

  it("uses the right article for an item", () => {
    const nodes = g.nodes.map((n) => (n.kind === "source" ? { ...n, item: "unobtainium" } : n));
    const r = loadLayouts(memory(artifactStore("green", { nodes, name: "Odd" })));
    expect(!r.ok && r.error).toMatch(/names an item /);
  });
});

describe("JavaScript's built-in names in a layout (#30 review)", () => {
  const g = goldens.green.artifactGraph;
  const refused = (extra: Record<string, unknown>) => {
    const r = loadLayouts(memory(artifactStore("green", extra)));
    expect(r.ok).toBe(false);
    return r.ok ? "" : r.error;
  };
  it("refuse the load for an item, a machine or a belt", () => {
    const items = g.nodes.map((n) => (n.kind === "source" ? { ...n, item: "constructor" } : n));
    expect(refused({ nodes: items })).toMatch(/"constructor"/);
    const machs = g.nodes.map((n) => (n.kind === "machine" ? { ...n, mach: "toString" } : n));
    expect(refused({ nodes: machs })).toMatch(/"toString"/);
    const edges = g.edges.map((e) => ({ ...e, belt: "valueOf" }));
    expect(refused({ edges })).toMatch(/"valueOf"/);
    expect(refused({ bp: { belt: "__proto__" } })).toMatch(/"__proto__"/);
  });
});

describe("a block's recipe (#26)", () => {
  const g = goldens.green.artifactGraph;
  const withRecipe = (recipe: string) =>
    g.nodes.map((n, i) => (n.kind === "machine" && i === 2 ? { ...n, recipe } : n));
  it("is kept when the planner uses it for that block's item", () => {
    const item = g.nodes[2]!.kind === "machine" ? g.nodes[2]!.item : "";
    const L = loaded(artifactStore("green", { nodes: withRecipe(item) }));
    expect(L.nodes[2]).toMatchObject({ recipe: item });
  });
  it("refuses the load when it isn't, naming it", () => {
    const r = loadLayouts(memory(artifactStore("green", { nodes: withRecipe("rocket-fuel") })));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/"rocket-fuel"/);
  });
});

describe("version 2 layouts", () => {
  it("are saved with a version and load back without being changed", () => {
    const first = loadLayouts(memory(artifactStore("green")));
    if (!first.ok || !first.state) throw new Error("load failed");
    const kv = memory();
    expect(saveLayouts(kv, first.state).ok).toBe(true);
    expect(JSON.parse(kv.data.get(LAYOUTS_KEY)!).version).toBe(2);
    expect(loadLayouts(kv)).toEqual(first);
  });

  it("aren't migrated twice: an entity name stays an entity name", () => {
    const state = JSON.parse(artifactStore("green"));
    const once = migrateLayouts(state.layouts);
    expect(migrateLayouts(once)).toEqual(once);
  });

  it("are checked too: an unknown machine refuses the load instead of breaking the tab later", () => {
    const state = JSON.parse(artifactStore("green"));
    const L = migrateLayouts(state.layouts).L1!;
    const nodes = L.nodes.map((n) =>
      n.kind === "machine" ? { ...n, mach: "assembling-machine-9" } : n,
    );
    const raw = JSON.stringify({ ...state, version: 2, layouts: { L1: { ...L, nodes } } });
    const kv = memory(raw);
    const r = loadLayouts(kv);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/"assembling-machine-9"/);
    expect(kv.data.get(LAYOUTS_KEY)).toBe(raw);
  });

  it("refuses data from a newer version instead of guessing", () => {
    const raw = JSON.stringify({ version: 3, layouts: {}, order: [], current: null });
    const r = loadLayouts(memory(raw));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/newer version/);
  });
});
