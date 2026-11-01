import { describe, expect, it } from "vitest";
import { goldens } from "../testdata/goldens.ts";
import { simulate } from "./simulate.ts";
import type { ModuleGraph } from "./types.ts";

// Green science: logistic-science-pack takes 6 s and makes 1; an Assembling machine 2 has
// crafting speed 0.75 (https://wiki.factorio.com/Assembling_machine_2). Eight of them make
// 8 * 0.75 / 6 = 1 pack/s. Recipe numbers per https://wiki.factorio.com/Logistic_science_pack.
describe("simulate: green science from plates", () => {
  const g = goldens.green.graph;
  const S = simulate(g);
  const node = (item: string, kind = "machine") => {
    const n = g.nodes.find((x) => x.kind === kind && x.item === item);
    if (!n) throw new Error(`no ${kind} node for ${item}`);
    return S.N[n.id]!;
  };

  it("makes 1 pack/s with 8 AM2", () => {
    expect(node("logistic-science-pack").maxOut).toBeCloseTo(1, 12);
    expect(node("logistic-science-pack").T).toBeCloseTo(1, 12);
  });

  it("asks upstream for 1 inserter/s and 1 belt/s (2 per craft)", () => {
    expect(node("inserter").T).toBeCloseTo(1, 12);
    expect(node("transport-belt").T).toBeCloseTo(1, 12);
  });

  it("sizes the inserter machine at 2/3 of an AM2 (0.5 s recipe, 1.5 crafts/s each)", () => {
    // 1 inserter/s over 0.75/0.5 = 1.5 crafts/s per machine
    const n = g.nodes.find((x) => x.kind === "machine" && x.item === "inserter")!;
    expect(Number(n.kind === "machine" && n.count)).toBe(1);
    expect(node("inserter").maxOut).toBeCloseTo(1.5, 12);
  });

  it("draws 5.5 iron plate/s and 1.5 copper plate/s from the sources", () => {
    // iron: gears 3 + inserters 1 + belts 0.5 + circuits 1; copper: 3 cable/s at 2 per plate
    expect(node("iron-plate", "source").sent).toBeCloseTo(5.5, 12);
    expect(node("copper-plate", "source").sent).toBeCloseTo(1.5, 12);
  });

  it("flags nothing as starved", () => {
    for (const r of Object.values(S.N)) expect(r.starved).toBe(false);
    expect(S.cyclic).toBe(false);
  });
});

describe("simulate: failures are loud", () => {
  it("throws on an unknown recipe instead of guessing", () => {
    const g: ModuleGraph = {
      name: "x",
      nodes: [
        { id: "a", kind: "machine", item: "not-an-item", count: 1, mach: "assembling-machine-2" },
      ],
      edges: [],
    };
    expect(() => simulate(g)).toThrow(/unknown recipe/);
  });

  it("throws on an unknown machine", () => {
    const g = {
      name: "x",
      nodes: [{ id: "a", kind: "machine", item: "pipe", count: 1, mach: "am9" }],
      edges: [],
    } as unknown as ModuleGraph;
    expect(() => simulate(g)).toThrow(/unknown machine/);
  });

  it("limits a belt-capped edge", () => {
    // 1 source at 20/s into a gear machine over a 15/s belt: edge is belt limited
    const g: ModuleGraph = {
      name: "x",
      nodes: [
        { id: "s", kind: "source", item: "iron-plate", rate: 20 },
        {
          id: "m",
          kind: "machine",
          item: "iron-gear-wheel",
          count: 40,
          mach: "assembling-machine-2",
        },
        { id: "o", kind: "output", item: null },
      ],
      edges: [
        { id: "e1", from: "s", to: "m", belt: "transport-belt" },
        { id: "e2", from: "m", to: "o", belt: "turbo-transport-belt" },
      ],
    };
    const S = simulate(g);
    expect(S.E.e1!.cap).toBe(15);
    expect(S.E.e1!.beltLimited).toBe(true);
    expect(S.E.e1!.flow).toBeCloseTo(15, 12);
    expect(S.N.m!.starved).toBe(true);
  });
});
