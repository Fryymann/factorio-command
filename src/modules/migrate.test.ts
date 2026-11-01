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

  it("refuses data from a newer version instead of guessing", () => {
    const raw = JSON.stringify({ version: 3, layouts: {}, order: [], current: null });
    const r = loadLayouts(memory(raw));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/newer version/);
  });
});
