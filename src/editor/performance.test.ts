import { describe, expect, it } from "vitest";
import { bpSolution, resolveBpSettings } from "../blueprint/fromModules.ts";
import { planLayout } from "../blueprint/layout.ts";
import { beltByKey } from "../data/game.ts";
import { goldens } from "../testdata/goldens.ts";
import * as act from "./actions.ts";
import { edFromLayout } from "./fromLayout.ts";
import { laneSim } from "./laneSim.ts";

// Blue science with every machine count and source rate x10, on turbo belts so rows stay
// belt-legal: about 10,000 entities, several times a realistic full chain.
function largeChain() {
  const g = goldens.blue.graph;
  const k = 10;
  const graph = {
    ...g,
    nodes: g.nodes.map((n) =>
      n.kind === "machine"
        ? { ...n, count: Number(n.count) * k }
        : n.kind === "source"
          ? { ...n, rate: Number(n.rate) * k }
          : n,
    ),
    edges: g.edges.map((e) => ({ ...e, belt: 60 })),
  };
  const bp = resolveBpSettings({ belt: "60" }, "60");
  const doc = edFromLayout(planLayout(bpSolution(graph, bp), bp), bp);
  return { doc, U: beltByKey("60").U };
}

describe("large chain", () => {
  const { doc, U } = largeChain();

  it("is large enough to mean something", () => {
    expect(doc.ents.length).toBeGreaterThan(8000);
  });

  it("laneSim finds nothing wrong with the untouched chain", () => {
    const sim = laneSim(doc.ents, U);
    expect(sim.checks).toEqual([]);
    expect(sim.mixedSet.size).toBe(0);
  });

  // Measured ~12 ms on a development machine (was ~31 ms before the quadratic output-inserter
  // scan was removed). The budget is 20x that so a slow CI box doesn't flake, but a return to
  // per-machine rescans or unbounded rescanning would still fail it.
  it("laneSim stays within its time budget", () => {
    laneSim(doc.ents, U); // warm up
    const t = performance.now();
    laneSim(doc.ents, U);
    expect(performance.now() - t).toBeLessThan(250);
  });

  it("80 undo steps hold only their changes, not 80 copies of the chain", () => {
    const s = act.createSession({ ents: [...doc.ents] }, U);
    for (let i = 0; i < 90; i++) {
      act.begin(s);
      act.placeBelt(s, 9000 + i, 9000, "E");
      act.commit(s);
    }
    expect(s.undo).toHaveLength(act.UNDO_LIMIT);
    const held = s.undo.reduce(
      (n, u) => n + u.added.length + u.removed.length + u.modified.length,
      0,
    );
    expect(held).toBe(act.UNDO_LIMIT); // one changed entity per step
  });
});

describe("undo restores exactly", () => {
  const fresh = () => {
    const bp = resolveBpSettings(undefined, "15");
    const doc = edFromLayout(planLayout(bpSolution(goldens.green.graph, bp), bp), bp);
    return act.createSession(doc, beltByKey("15").U);
  };

  it("puts a removed entity back at the same place in the list", () => {
    const s = fresh();
    const before = JSON.stringify(s.ents);
    const mid = s.ents[Math.floor(s.ents.length / 2)]!;
    expect(mid.t).not.toBe("machine");
    act.deleteEnt(s, mid);
    expect(s.ents).not.toContain(mid);
    act.undo(s);
    expect(JSON.stringify(s.ents)).toBe(before);
    expect(s.ents).toContain(mid); // same object, so a selection of it stays valid
  });

  it("undoes an edit to an entity that a later step deleted, then restored", () => {
    const s = fresh();
    const before = JSON.stringify(s.ents);
    const belt = s.ents.find((e) => e.t === "belt" && e.dir === "S")!;
    act.begin(s);
    act.placeBelt(s, belt.x, belt.y, "N"); // step 1: edit
    act.commit(s);
    act.deleteEnt(s, belt); // step 2: delete the same entity
    act.undo(s); // back to step 1's result
    act.undo(s); // back to the start
    expect(JSON.stringify(s.ents)).toBe(before);
  });

  it("undoes a step that removes some entities and adds others", () => {
    const s = fresh();
    const before = JSON.stringify(s.ents);
    const [a, b] = s.ents.filter((e) => e.t === "pole") as [(typeof s.ents)[0], (typeof s.ents)[0]];
    act.begin(s);
    act.remove(s, a);
    act.remove(s, b);
    act.add(s, { t: "belt", x: 500, y: 500, dir: "E" });
    expect(act.commit(s)).toBe(true);
    expect(s.undo[0]).toMatchObject({ added: [{ x: 500 }], removed: [{ ent: a }, { ent: b }] });
    act.undo(s);
    expect(JSON.stringify(s.ents)).toBe(before);
  });
});
