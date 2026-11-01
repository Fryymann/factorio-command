import { describe, expect, it } from "vitest";
import { bpSolution, resolveBpSettings } from "../blueprint/fromModules.ts";
import { planLayout } from "../blueprint/layout.ts";
import { startChainEdit } from "../editor/chainEdit.ts";
import { edFromLayout } from "../editor/fromLayout.ts";
import { goldens } from "../testdata/goldens.ts";
import { LAYOUTS_KEY, loadLayouts, saveLayouts } from "./storage.ts";
import type { KeyValueStore, LayoutsState, SavedLayout } from "./storage.ts";

function memory(initial?: string): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>(initial === undefined ? [] : [[LAYOUTS_KEY, initial]]);
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

function chainState(name: "green" | "blue" = "green") {
  const bp = resolveBpSettings(undefined, "transport-belt");
  const sol = bpSolution(goldens[name].graph, bp);
  const LY = planLayout(sol, bp);
  const layout: SavedLayout = { id: "L1", ...goldens[name].graph, bp };
  const state: LayoutsState = { layouts: { L1: layout }, order: ["L1"], current: "L1" };
  return { bp, sol, LY, layout, state };
}

describe("saved layouts from before chain editing", () => {
  it("load unchanged, with only per-module edits", () => {
    // Shape written by artifacts/FCP_v1-2.html: edits keyed by node id, object-form entities.
    const { LY, bp, layout } = chainState();
    const nodeId = layout.nodes.find((n) => n.kind === "machine")!.id;
    const old = {
      layouts: { L1: { ...layout, edits: { [nodeId]: edFromLayout(LY, bp) } } },
      order: ["L1"],
      current: "L1",
    };
    const r = loadLayouts(memory(JSON.stringify(old)));
    expect(r).toEqual({ ok: true, state: old });
    expect(r.ok && r.state!.layouts.L1!.chainEdit).toBeUndefined();
  });

  it("defaults order to the layout ids", () => {
    const { layout } = chainState();
    const r = loadLayouts(memory(JSON.stringify({ layouts: { L1: layout }, current: "L1" })));
    expect(r.ok && r.state!.order).toEqual(["L1"]);
  });

  it("nothing saved is not an error", () => {
    expect(loadLayouts(memory())).toEqual({ ok: true, state: null });
  });
});

describe("chainEdit round trip", () => {
  for (const name of ["green", "blue"] as const) {
    it(`${name}: save then load returns the same edit`, () => {
      const { sol, LY, bp, layout, state } = chainState(name);
      layout.chainEdit = startChainEdit(LY, sol, bp);
      // a real edit, so it is not just the generated layout
      layout.chainEdit.ents = layout.chainEdit.ents.filter((e) => e.t !== "pole");
      const kv = memory();
      expect(saveLayouts(kv, state).ok).toBe(true);
      const r = loadLayouts(kv);
      expect(r.ok && r.state!.layouts.L1!.chainEdit).toEqual(layout.chainEdit);
    });
  }

  it("the old object form of a chainEdit still loads", () => {
    const { sol, LY, bp, layout } = chainState();
    const edit = startChainEdit(LY, sol, bp);
    const json = JSON.stringify({
      layouts: { L1: { ...layout, chainEdit: edit } },
      order: ["L1"],
      current: "L1",
    });
    const r = loadLayouts(memory(json));
    expect(r.ok && r.state!.layouts.L1!.chainEdit).toEqual(edit);
  });

  it("the compact form is much smaller than objects", () => {
    const { sol, LY, bp, layout, state } = chainState("blue");
    layout.chainEdit = startChainEdit(LY, sol, bp);
    const kv = memory();
    expect(saveLayouts(kv, state).ok).toBe(true);
    const objects = JSON.stringify(layout.chainEdit.ents).length;
    const stored = JSON.stringify(JSON.parse(kv.data.get(LAYOUTS_KEY)!).layouts.L1.chainEdit.ents);
    expect(stored.length).toBeLessThan(objects * 0.5);
  });
});

describe("failed saves and bad data", () => {
  it("reports a full browser store instead of losing the edit silently", () => {
    const { state } = chainState();
    const kv: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      },
    };
    const r = saveLayouts(kv, state);
    expect(r).toMatchObject({ ok: false, reason: "quota" });
    expect(!r.ok && r.message).toMatch(/NOT saved/);
  });

  it("reports other write errors too", () => {
    const { state } = chainState();
    const kv: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error("disk on fire");
      },
    };
    expect(saveLayouts(kv, state)).toMatchObject({ ok: false, reason: "error" });
  });

  it("refuses corrupt data instead of starting empty", () => {
    expect(loadLayouts(memory("{nope"))).toMatchObject({ ok: false });
    expect(loadLayouts(memory(JSON.stringify({ foo: 1 })))).toMatchObject({ ok: false });
  });

  it("refuses a chainEdit it can't read instead of dropping entities", () => {
    const { layout } = chainState();
    const bad = {
      layouts: { L1: { ...layout, chainEdit: { ents: [["z", 1, 2]], basis: {} } } },
      order: ["L1"],
    };
    const r = loadLayouts(memory(JSON.stringify(bad)));
    expect(r.ok).toBe(false);
  });
});
