// Generated layout -> editable entities. Ported from `edFromLayout` (artifacts/FCP_v1-2.html,
// line 1738). Raw bus columns become `feed` belts on their top tile; pipes stay as guides.
import type { Layout } from "../blueprint/layout.ts";
import { tkey } from "./geometry.ts";
import type { EdEnt, EditDoc, InsKind } from "./types.ts";

const BASE_INS: readonly string[] = ["basic", "fast", "bulk"];

export function edFromLayout(LY: Layout, bp: { ins: string }): EditDoc {
  if (!BASE_INS.includes(bp.ins)) throw new Error(`edFromLayout: unknown inserter ${bp.ins}`);
  const ents: EdEnt[] = [];
  const rawTop = new Map(LY.cols.filter((c) => c.raw).map((c) => [tkey(c.x, 0), c.item]));
  for (const e of LY.ents) {
    if (e.t === "belt") {
      const o: EdEnt = { t: "belt", x: e.x, y: e.y, dir: e.dir };
      const f = rawTop.get(tkey(e.x, e.y));
      if (f) o.feed = f;
      ents.push(o);
    } else if (e.t === "ug") ents.push({ t: "ug", x: e.x, y: e.y, dir: e.dir, io: e.io });
    else if (e.t === "splitter") ents.push({ t: "splitter", x: e.x, y: e.y, dir: e.dir });
    else if (e.t === "ins")
      ents.push({
        t: "ins",
        x: e.x,
        y: e.y,
        dir: "S",
        kind: e.long ? "long" : (bp.ins as InsKind),
      });
    else if (e.t === "pole") ents.push({ t: "pole", x: e.x, y: e.y });
    else if (e.t === "pipe") ents.push({ t: "pipe", x: e.x, y: e.y, item: e.item, pdir: e.pdir });
    else
      ents.push({
        t: "machine",
        x: e.x,
        y: e.y,
        w: e.w,
        h: e.h,
        item: e.item,
        ent: e.ent,
        mname: e.mname,
        recipe: e.recipe,
      });
  }
  return { ents };
}
