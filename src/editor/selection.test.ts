import { describe, expect, it } from "vitest";
import { bpSolution, resolveBpSettings } from "../blueprint/fromModules.ts";
import { planLayout } from "../blueprint/layout.ts";
import { beltByKey } from "../data/game.ts";
import { goldens } from "../testdata/goldens.ts";
import * as act from "./actions.ts";
import { annotate, groupChecks } from "./annotations.ts";
import { edFromLayout } from "./fromLayout.ts";
import { laneSim } from "./laneSim.ts";
import { canMoveGroup, deleteGroup, moveGroup, selectInBox } from "./selection.ts";

function fresh(name: "green" | "blue" = "green") {
  const bp = resolveBpSettings(undefined, "15");
  const doc = edFromLayout(planLayout(bpSolution(goldens[name].graph, bp), bp), bp);
  return act.createSession(doc, beltByKey("15").U);
}

// Green science layout (see layout.test.ts): the transport-belt row is y=46..54 with its machine
// at (28,50) 3x3, input belts at y=47 and y=49, inserter row y=49, output inserters y=53.
describe("box select", () => {
  it("selects everything overlapping the box, in any corner order", () => {
    const s = fresh();
    const a = selectInBox(s, { x0: 27, y0: 50, x1: 31, y1: 52 });
    const b = selectInBox(s, { x0: 31, y0: 52, x1: 27, y1: 50 });
    expect(b).toEqual(a);
    expect(a.filter((e) => e.t === "machine").map((e) => e.t === "machine" && e.item)).toEqual([
      "transport-belt",
    ]);
  });

  it("includes a machine that only touches the box edge tile", () => {
    const s = fresh();
    const hit = selectInBox(s, { x0: 30, y0: 52, x1: 30, y1: 52 }); // the machine's SE corner tile
    expect(hit.map((e) => e.t)).toEqual(["machine"]);
  });

  it("an empty box selects nothing", () => {
    expect(selectInBox(fresh(), { x0: 500, y0: 500, x1: 510, y1: 510 })).toEqual([]);
  });
});

describe("move group", () => {
  it("moves a whole row as one undo step and keeps it working", () => {
    const s = fresh();
    const before = JSON.stringify(s.ents);
    const row = selectInBox(s, { x0: 26, y0: 56, x1: 60, y1: 64 }); // the 8-pack row
    expect(row.filter((e) => e.t === "machine")).toHaveLength(8);
    const n = s.ents.length;
    expect(moveGroup(s, row, 40, 0)).toBe(true);
    expect(s.ents).toHaveLength(n);
    expect(s.undo).toHaveLength(1);
    expect(row.every((e) => e.x >= 26 + 40 - 2)).toBe(true);
    act.undo(s);
    expect(JSON.stringify(s.ents)).toBe(before);
  });

  it("refuses a move that would overlap something outside the group, changing nothing", () => {
    const s = fresh();
    const before = JSON.stringify(s.ents);
    const m = selectInBox(s, { x0: 28, y0: 50, x1: 30, y1: 52 }).filter((e) => e.t === "machine");
    expect(canMoveGroup(s, m, 0, 10)).toBe(false); // into the next row
    expect(moveGroup(s, m, 0, 10)).toBe(false);
    expect(JSON.stringify(s.ents)).toBe(before);
    expect(s.undo).toHaveLength(0);
  });

  it("allows moving into tiles the group itself is leaving", () => {
    const solo = act.createSession(
      {
        ents: [
          { t: "belt", x: 0, y: 0, dir: "E" },
          { t: "belt", x: 1, y: 0, dir: "E" },
        ],
      },
      4,
    );
    // the first belt moves onto the second's tile while the second moves out
    expect(canMoveGroup(solo, solo.ents, 1, 0)).toBe(true);
    // but moving only the first belt would land on the second
    expect(canMoveGroup(solo, [solo.ents[0]!], 1, 0)).toBe(false);
  });

  it("a zero move or empty group does nothing", () => {
    const s = fresh();
    expect(moveGroup(s, [s.ents[0]!], 0, 0)).toBe(false);
    expect(moveGroup(s, [], 3, 3)).toBe(false);
    expect(s.undo).toHaveLength(0);
  });
});

describe("delete group", () => {
  it("removes everything but machines, as one undo step", () => {
    const s = fresh();
    const before = JSON.stringify(s.ents);
    const group = selectInBox(s, { x0: 27, y0: 49, x1: 31, y1: 54 });
    const machines = group.filter((e) => e.t === "machine").length;
    const removed = deleteGroup(s, group);
    expect(removed).toBe(group.length - machines);
    expect(s.ents.filter((e) => e.t === "machine")).toHaveLength(13);
    expect(s.undo).toHaveLength(1);
    act.undo(s);
    expect(JSON.stringify(s.ents)).toBe(before);
  });

  it("deleting only machines does nothing", () => {
    const s = fresh();
    const m = s.ents.filter((e) => e.t === "machine");
    expect(deleteGroup(s, m)).toBe(0);
    expect(s.undo).toHaveLength(0);
  });
});

describe("annotations", () => {
  const green = () => {
    const s = fresh();
    return annotate(s.ents, s.sim);
  };

  it("labels the two raw feeds", () => {
    expect(green().feeds).toEqual([
      { x: 0, y: 0, item: "copper-plate" },
      { x: 3, y: 0, item: "iron-plate" },
    ]);
  });

  it("labels one row per machine cluster, with machine counts", () => {
    expect(green().rows.map((r) => [r.item, r.count])).toEqual([
      ["copper-cable", 1],
      ["electronic-circuit", 1],
      ["iron-gear-wheel", 1],
      ["inserter", 1],
      ["transport-belt", 1],
      ["logistic-science-pack", 8],
    ]);
  });

  it("marks only the final product as the chain's output", () => {
    expect(green().outputs).toEqual([{ x: 21, y: 66, item: "logistic-science-pack" }]);
  });

  it("marks where each row's product belt starts", () => {
    expect(new Set(green().products.map((p) => p.item))).toEqual(
      new Set([
        "copper-cable",
        "electronic-circuit",
        "iron-gear-wheel",
        "inserter",
        "transport-belt",
        "logistic-science-pack",
      ]),
    );
  });

  it("follows an edit: moving a row moves its label", () => {
    const s = fresh();
    const row = selectInBox(s, { x0: 26, y0: 56, x1: 60, y1: 64 });
    moveGroup(s, row, 40, 0);
    const label = annotate(s.ents, s.sim).rows.find((r) => r.item === "logistic-science-pack")!;
    expect(label.x).toBe(68);
    expect(label.count).toBe(8);
  });
});

describe("groupChecks", () => {
  it("groups machine checks by item and keeps belt checks apart, in order", () => {
    const s = fresh();
    // strip the circuit and gear machines' inserters so both report problems
    for (const item of ["electronic-circuit", "iron-gear-wheel"]) {
      const m = s.ents.find((e) => e.t === "machine" && e.item === item)!;
      for (const e of selectInBox(s, { x0: m.x, y0: m.y - 1, x1: m.x + 2, y1: m.y - 1 }))
        act.remove(s, e);
    }
    const sim = laneSim(s.ents, 4);
    const groups = groupChecks(sim.checks);
    expect(groups.map((g) => g.item)).toEqual(["electronic-circuit", "iron-gear-wheel"]);
    expect(groups.flatMap((g) => g.checks)).toHaveLength(sim.checks.length);
  });

  it("puts checks with no machine under null", () => {
    expect(groupChecks([{ text: "note" }])).toEqual([{ item: null, checks: [{ text: "note" }] }]);
  });
});
