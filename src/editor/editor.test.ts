import { describe, expect, it } from "vitest";
import { BELT_TIERS } from "../data/legacy.ts";
import { bpSolution, resolveBpSettings } from "../blueprint/fromModules.ts";
import { planLayout } from "../blueprint/layout.ts";
import { blueprintObject, DIR16 } from "../blueprint/export.ts";
import { decodeBlueprint, encodeBlueprint } from "../blueprint/encode.ts";
import { canonHash, goldens } from "../testdata/goldens.ts";
import * as act from "./actions.ts";
import { edFromLayout } from "./fromLayout.ts";
import { laneSim } from "./laneSim.ts";
import type { EdEnt } from "./types.ts";

type Name = "green" | "blue";
function setup(name: Name) {
  const bp = resolveBpSettings(undefined, "15");
  const sol = bpSolution(goldens[name].graph, bp);
  const LY = planLayout(sol, bp);
  const doc = edFromLayout(LY, bp);
  const U = BELT_TIERS[bp.belt]!.U;
  return { bp, sol, LY, doc, U };
}

describe("edFromLayout matches the artifact", () => {
  for (const name of ["green", "blue"] as const) {
    it(`${name}: same entities, and raw columns become feed belts`, () => {
      const { doc } = setup(name);
      expect(doc.ents).toHaveLength(goldens[name].ed.n);
      expect(canonHash(doc.ents)).toBe(goldens[name].ed.hash);
      expect(
        doc.ents.flatMap((e) => (e.t === "belt" && e.feed ? [[e.x, e.y, e.feed]] : [])),
      ).toEqual(goldens[name].ed.feeds);
    });
  }

  it("rejects an unknown inserter type", () => {
    const { LY } = setup("green");
    expect(() => edFromLayout(LY, { ins: "long" })).toThrow(/inserter/);
  });
});

describe("laneSim on an untouched generated chain", () => {
  for (const name of ["green", "blue"] as const) {
    it(`${name}: reports exactly what the artifact reports (nothing)`, () => {
      const { doc, U } = setup(name);
      const sim = laneSim(doc.ents, U);
      expect(sim.checks.map((c) => [c.x ?? null, c.y ?? null, c.text])).toEqual(
        goldens[name].lane.checks,
      );
      expect(sim.mixedSet.size).toBe(goldens[name].lane.mixed);
      expect(sim.pair.size / 2).toBe(goldens[name].lane.pairs);
    });
  }

  it("green: no mixed lanes, every machine gets every ingredient and has an output", () => {
    const { doc, U } = setup("green");
    const sim = laneSim(doc.ents, U);
    expect(sim.checks).toEqual([]);
    expect(sim.mixedSet.size).toBe(0);
  });

  it("flags a machine whose input inserters are removed", () => {
    const { doc, U } = setup("green");
    const s = act.createSession(doc, U);
    const gear = s.ents.find((e) => e.t === "machine" && e.item === "iron-gear-wheel")!;
    // 3 plates/s per gear machine is more than one fast inserter moves, so it has two
    const feeders = s.ents.filter((e) => e.t === "ins" && e.y === gear.y - 1);
    expect(feeders.filter((e) => e.x >= gear.x && e.x < gear.x + 3)).toHaveLength(2);
    for (const e of feeders) if (e.x >= gear.x && e.x < gear.x + 3) act.remove(s, e);
    expect(s.sim.checks.map((c) => c.text)).toContain(
      "Iron gear wheel machine is missing Iron plate.",
    );
  });

  it("flags a mixed lane when a second item enters the iron plate column", () => {
    // The iron plate column is the bus column at x=3 (see the layout golden).
    const { doc, U } = setup("green");
    const s = act.createSession(doc, U);
    const mid = s.ents.find((e) => e.t === "belt" && e.x === 3 && e.y === 6 && !e.feed)!;
    act.place(s, { tool: "feed", dir: "S", insKind: "fast", feed: "copper-plate" }, mid.x, mid.y);
    expect(s.sim.mixedSet.size).toBeGreaterThan(0);
    expect(s.sim.checks.some((c) => /mixed lane/.test(c.text))).toBe(true);
  });

  it("flags an underground entrance with no exit in reach", () => {
    const U = 4;
    const ents: EdEnt[] = [
      { t: "ug", x: 0, y: 0, dir: "E", io: "input" },
      { t: "ug", x: 6, y: 0, dir: "E", io: "output" }, // 5 tiles gap, reach is 4
    ];
    const texts = laneSim(ents, U).checks.map((c) => c.text);
    expect(texts).toEqual([
      "Underground entrance has no partner within 4 tiles.",
      "Underground exit has no partner within 4 tiles.",
    ]);
    // one tile closer pairs up
    ents[1] = { t: "ug", x: 5, y: 0, dir: "E", io: "output" };
    expect(laneSim(ents, U).checks).toEqual([]);
  });

  it("keeps lanes on a straight belt and puts a side-load on the near lane", () => {
    // Facing east, left lane is north. A belt joining from the south side-loads onto the south (right) lane.
    const ents: EdEnt[] = [
      { t: "belt", x: 0, y: 0, dir: "E", feed: "iron-plate" },
      { t: "belt", x: 1, y: 0, dir: "E" },
      { t: "belt", x: 2, y: 0, dir: "E" },
      { t: "belt", x: 2, y: 1, dir: "N", feed: "copper-plate" },
    ];
    // (2,1) points north into (2,0): not the straight predecessor, and (2,0) has a belt behind it,
    // so it's a side-load onto the right lane
    const sim = laneSim(ents, 4);
    const end = sim.LN.get("2,0")!;
    expect([...end.L]).toEqual(["iron-plate"]);
    expect([...end.R].sort()).toEqual(["copper-plate", "iron-plate"]);
  });
});

describe("editor actions", () => {
  const tool = {
    tool: "belt" as const,
    dir: "E" as const,
    insKind: "fast" as const,
    feed: "iron-plate",
  };

  it("places a belt on an empty tile, and refuses to overlap a machine", () => {
    const { doc, U } = setup("green");
    const s = act.createSession(doc, U);
    const n = s.ents.length;
    const free = { x: 100, y: 100 };
    act.placeBelt(s, free.x, free.y, "S");
    expect(s.ents).toHaveLength(n + 1);
    expect(s.ents.at(-1)).toEqual({ t: "belt", x: 100, y: 100, dir: "S" });
    const m = s.ents.find((e) => e.t === "machine")!;
    expect(act.add(s, { t: "pole", x: m.x, y: m.y })).toBe(false);
    expect(s.ents).toHaveLength(n + 1);
  });

  it("a move, a belt re-aim and an erase each change exactly the expected entity, and undo restores", () => {
    const { doc, U } = setup("green");
    const s = act.createSession(doc, U);
    const before = JSON.stringify(s.ents);

    // erase a pole
    const pole = s.ents.find((e) => e.t === "pole")!;
    act.begin(s);
    act.erase(s, pole.x, pole.y);
    expect(act.commit(s)).toBe(true);
    expect(s.ents).toHaveLength(doc.ents.length - 1);
    expect(s.ents.includes(pole)).toBe(false);

    // re-aim a belt
    const belt = s.ents.find((e) => e.t === "belt" && e.dir === "S")!;
    act.begin(s);
    act.placeBelt(s, belt.x, belt.y, "N");
    act.commit(s);
    expect(belt.t === "belt" && belt.dir).toBe("N");

    // moving a machine is a begin/commit around changing x,y once it fits
    const m = s.ents.find((e) => e.t === "machine")!;
    act.begin(s);
    expect(act.fits(s, m, m.x + 200, m.y)).toBe(true);
    m.x += 200;
    act.recalc(s);
    act.commit(s);
    expect(s.undo).toHaveLength(3);

    act.undo(s);
    act.undo(s);
    act.undo(s);
    expect(JSON.stringify(s.ents)).toBe(before);
    expect(act.undo(s)).toBe(false);
  });

  it("an unchanged step adds no undo entry", () => {
    const { doc, U } = setup("green");
    const s = act.createSession(doc, U);
    act.begin(s);
    expect(act.commit(s)).toBe(false);
    expect(s.undo).toHaveLength(0);
  });

  it("keeps at most 80 undo steps", () => {
    const { doc, U } = setup("green");
    const s = act.createSession(doc, U);
    for (let i = 0; i < 85; i++) {
      act.begin(s);
      act.placeBelt(s, 100 + i, 100, "E");
      act.commit(s);
    }
    expect(s.undo).toHaveLength(act.UNDO_LIMIT);
  });

  it("rotate and delete are one undo step each; machines can't be deleted", () => {
    const { doc, U } = setup("green");
    const s = act.createSession(doc, U);
    const ins = s.ents.find((e) => e.t === "ins")!;
    const was = ins.t === "ins" ? ins.dir : null;
    act.rotate(s, ins, false);
    expect(ins.t === "ins" && ins.dir).toBe("W"); // S rotated clockwise
    expect(was).toBe("S");
    act.deleteEnt(s, ins);
    expect(s.undo).toHaveLength(2);
    const m = s.ents.find((e) => e.t === "machine")!;
    expect(act.deleteEnt(s, m)).toBe(false);
    expect(s.undo).toHaveLength(2);
  });

  it("the underground tool picks exit vs entrance from the entrance already placed", () => {
    const s = act.createSession({ ents: [{ t: "ug", x: 0, y: 0, dir: "E", io: "input" }] }, 4);
    act.place(s, { ...tool, tool: "ug" }, 3, 0);
    expect(s.ents[1]).toEqual({ t: "ug", x: 3, y: 0, dir: "E", io: "output" });
    act.place(s, { ...tool, tool: "ug" }, 20, 0);
    expect(s.ents[2]).toEqual({ t: "ug", x: 20, y: 0, dir: "E", io: "input" });
  });

  it("the feed tool toggles an item on a belt", () => {
    const s = act.createSession({ ents: [{ t: "belt", x: 0, y: 0, dir: "S" }] }, 4);
    act.place(s, { ...tool, tool: "feed" }, 0, 0);
    expect(s.ents[0]).toEqual({ t: "belt", x: 0, y: 0, dir: "S", feed: "iron-plate" });
    act.place(s, { ...tool, tool: "feed" }, 0, 0);
    expect(s.ents[0]).toEqual({ t: "belt", x: 0, y: 0, dir: "S" });
  });
});

describe("blueprint export (one exporter)", () => {
  const tierOf = (bp: { belt: string }) => BELT_TIERS[bp.belt]!;
  // The artifact writes version 2.0.0.0. We now write 2.1.24.1 on purpose (tested below), so the
  // goldens are compared with the artifact's version put back; everything else must still match.
  const asArtifact = (o: ReturnType<typeof blueprintObject>) => ({
    blueprint: { ...o.blueprint, version: 562949953421312 },
  });

  for (const name of ["green", "blue"] as const) {
    it(`${name}: reproduces both of the artifact's exporters`, () => {
      const { sol, doc, bp } = setup(name);
      // artifact's generated-layout exporter
      const gen = blueprintObject(doc.ents, tierOf(bp), sol.icon, sol.label);
      expect(gen.blueprint.entities).toHaveLength(goldens[name].bpoN);
      expect(canonHash(asArtifact(gen))).toBe(goldens[name].bpoHash);
      // artifact's edited exporter
      const ed = blueprintObject(doc.ents, tierOf(bp), sol.icon, sol.label + " (edited)");
      expect(canonHash(asArtifact(ed))).toBe(goldens[name].edBpoHash);
      expect(ed.blueprint.label).toBe(goldens[name].edBpoLabel);
    });
  }

  it("targets Factorio 2.1: version and 16-way directions", () => {
    // https://wiki.factorio.com/Blueprint_string_format: N=0, E=4, S=8, W=12 since 2.0.
    // Version 2.1.24.1 is what Factorio 2.1.24 writes (see encode.test.ts).
    expect(DIR16).toEqual({ N: 0, E: 4, S: 8, W: 12 });
    const { sol, doc, bp } = setup("green");
    expect(blueprintObject(doc.ents, tierOf(bp), sol.icon, sol.label).blueprint.version).toBe(
      562954249961473,
    );
  });

  it("writes the pickup side for inserters, from the drop direction", () => {
    // Direction 0 confirmed in Factorio 2.1.24: it picks up from the north and drops south
    // (Ian, 2026-11-01, on a blueprint this planner exported).
    const e = (dir: "N" | "E" | "S" | "W"): EdEnt => ({ t: "ins", x: 0, y: 0, dir, kind: "fast" });
    const dirs = (["N", "E", "S", "W"] as const).map(
      (d) => blueprintObject([e(d)], BELT_TIERS["15"]!, null, "x").blueprint.entities[0]!.direction,
    );
    expect(dirs).toEqual([8, 12, 0, 4]);
  });

  it("omits pipe guides and cuts the label to 100 characters", () => {
    const { doc, bp } = setup("blue");
    const o = blueprintObject(doc.ents, tierOf(bp), null, "x".repeat(150));
    expect(o.blueprint.label).toHaveLength(100);
    expect(o.blueprint.entities).toHaveLength(goldens.blue.bpoN);
    expect(doc.ents.filter((e) => e.t === "pipe")).toHaveLength(12);
  });

  it("survives the string encoding", async () => {
    const { sol, doc, bp } = setup("green");
    const obj = blueprintObject(doc.ents, tierOf(bp), sol.icon, sol.label);
    expect(await decodeBlueprint(await encodeBlueprint(obj))).toEqual(obj);
  });
});
