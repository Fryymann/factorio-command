// Belt lane simulation. Ported from `laneSim` (artifacts/FCP_v1-2.html, lines 1761-1852), with
// the fixed-point loop replaced by a worklist (same results; notes are listed in sorted order).
// Rules: straight and curved belts keep their lanes; a belt joining another from the side
// (side-load) puts everything on the near lane; inserters drop on the far lane (on the right
// lane when lined up with the belt); undergrounds carry both lanes through; splitters mix their
// two inputs onto both outputs, lanes kept.
import { isFluid, plannedRecipe, itemName } from "../data/game.ts";
import { DV, LEFT, OPP, tilesOf, tkey } from "./geometry.ts";
import type { Dir, EdEnt } from "./types.ts";

export interface Lane {
  L: Set<string>;
  R: Set<string>;
}

export interface Check {
  x?: number;
  y?: number;
  m?: EdEnt;
  text: string;
}

export interface InsEnds {
  px: number;
  py: number;
  qx: number;
  qy: number;
}

export interface LaneSimResult {
  G: Map<string, EdEnt>;
  LN: Map<string, Lane>;
  pair: Map<EdEnt, EdEnt>;
  checks: Check[];
  mixedSet: Set<EdEnt>;
  insEnds: (e: EdEnt & { t: "ins" }) => InsEnds;
}

type BeltLike = EdEnt & { t: "belt" | "ug" | "splitter" };
const beltLike = (e: EdEnt | undefined): e is BeltLike =>
  !!e && (e.t === "belt" || e.t === "ug" || e.t === "splitter");

/** `U` is the underground reach of the belt tier. */
export function laneSim(ents: EdEnt[], U: number): LaneSimResult {
  const G = new Map<string, EdEnt>();
  for (const e of ents) for (const k of tilesOf(e)) G.set(k, e);
  const at = (x: number, y: number) => G.get(tkey(x, y));
  const LN = new Map<string, Lane>();
  const lane = (x: number, y: number): Lane => {
    const l = LN.get(tkey(x, y));
    if (!l) throw new Error(`laneSim: no lane state at ${x},${y}`);
    return l;
  };
  const notes = new Set<string>();
  for (const e of ents)
    if (beltLike(e)) {
      if (e.t === "splitter") {
        const o: Lane = { L: new Set(), R: new Set() };
        tilesOf(e).forEach((k) => LN.set(k, o));
      } else LN.set(tkey(e.x, e.y), { L: new Set(), R: new Set() });
      if (e.t === "belt" && e.feed) {
        const o = lane(e.x, e.y);
        o.L.add(e.feed);
        o.R.add(e.feed);
      }
    }
  const pair = new Map<EdEnt, EdEnt>();
  for (const e of ents)
    if (e.t === "ug" && e.io === "input") {
      const [dx, dy] = DV[e.dir];
      for (let k = 1; k <= U + 1; k++) {
        const o = at(e.x + dx * k, e.y + dy * k);
        if (o && o.t === "ug" && o.dir === e.dir) {
          if (o.io === "output" && !pair.has(o)) {
            pair.set(e, o);
            pair.set(o, e);
          }
          break;
        }
      }
    }
  const btiles = (e: BeltLike): [number, number][] =>
    e.t === "splitter"
      ? tilesOf(e).map((k) => k.split(",").map(Number) as [number, number])
      : [[e.x, e.y]];
  const target = (e: BeltLike, x: number, y: number): [number, number, boolean] | null => {
    if (e.t === "ug" && e.io === "input") {
      const o = pair.get(e);
      return o ? [o.x, o.y, true] : null;
    }
    const [dx, dy] = DV[e.dir];
    return [x + dx, y + dy, false];
  };
  const feedsInto = (nx: number, ny: number, tx: number, ty: number): boolean => {
    const n = at(nx, ny);
    if (!beltLike(n) || (n.t === "ug" && n.io === "input")) return false;
    const [dx, dy] = DV[n.dir];
    return nx + dx === tx && ny + dy === ty;
  };
  const isCurve = (t: BeltLike, tx: number, ty: number): boolean => {
    const [bx, by] = DV[t.dir];
    if (feedsInto(tx - bx, ty - by, tx, ty)) return false;
    const l = DV[LEFT[t.dir]];
    const r = DV[OPP[LEFT[t.dir]]];
    return feedsInto(tx + l[0], ty + l[1], tx, ty) !== feedsInto(tx + r[0], ty + r[1], tx, ty);
  };
  const add = (set: Set<string>, items: Iterable<string>): boolean => {
    let ch = false;
    for (const i of items)
      if (!set.has(i)) {
        set.add(i);
        ch = true;
      }
    return ch;
  };
  const both = (tl: Lane, s: Lane): boolean => {
    const a = add(tl.L, s.L);
    const b = add(tl.R, s.R);
    return a || b;
  };
  const transfer = (src: BeltLike, s: Lane, tx: number, ty: number, tunnel: boolean): boolean => {
    const t = at(tx, ty);
    if (!beltLike(t)) return false;
    const tl = lane(tx, ty);
    if (tunnel) return both(tl, s);
    const d: Dir = src.dir;
    if (t.t === "ug" && t.io === "output") {
      if (t.dir !== d && t.dir !== OPP[d])
        notes.add("Side-loading onto an underground exit isn't modelled.");
      return false;
    }
    if (t.dir === d) return both(tl, s);
    if (t.dir === OPP[d]) return false;
    if (t.t !== "belt") {
      notes.add(
        `Side-loading onto ${t.t === "ug" ? "an underground entrance" : "a splitter"} isn't modelled.`,
      );
      return false;
    }
    if (isCurve(t, tx, ty)) return both(tl, s);
    return add(OPP[d] === LEFT[t.dir] ? tl.L : tl.R, [...s.L, ...s.R]);
  };
  const insEnds = (e: EdEnt & { t: "ins" }): InsEnds => {
    const r = e.kind === "long" ? 2 : 1;
    const [dx, dy] = DV[e.dir];
    return { px: e.x - dx * r, py: e.y - dy * r, qx: e.x + dx * r, qy: e.y + dy * r };
  };
  const machIn = new Map<EdEnt, Set<string>>();

  // Worklist instead of the artifact's "rescan every entity until nothing changes" loop. Lane
  // sets only ever grow, so the result is the same fixed point; only tiles whose lanes changed
  // are looked at again.
  const inserters = ents.filter((e): e is EdEnt & { t: "ins" } => e.t === "ins");
  const pickers = new Map<string, (EdEnt & { t: "ins" })[]>(); // tile -> inserters picking from it
  for (const e of inserters) {
    const I = insEnds(e);
    const k = tkey(I.px, I.py);
    const list = pickers.get(k);
    if (list) list.push(e);
    else pickers.set(k, [e]);
  }
  const queue: string[] = [];
  const queued = new Set<string>();
  const enqueue = (k: string) => {
    if (queued.has(k)) return;
    queued.add(k);
    queue.push(k);
  };
  /** The lanes at (x, y) changed: look again at that belt (all of a splitter) and its pickers. */
  const touch = (x: number, y: number) => {
    const e = at(x, y);
    if (!beltLike(e)) return;
    for (const k of tilesOf(e)) enqueue(k);
  };
  const runInserter = (e: EdEnt & { t: "ins" }) => {
    const I = insEnds(e);
    const src = at(I.px, I.py);
    const dst = at(I.qx, I.qy);
    let items: string[] = [];
    if (beltLike(src)) {
      const l = lane(I.px, I.py);
      items = [...l.L, ...l.R];
    } else if (src && src.t === "machine" && !isFluid(src.item)) items = [src.item];
    if (!items.length || !dst) return;
    if (beltLike(dst)) {
      const tl = lane(I.qx, I.qy);
      const side = OPP[e.dir];
      if (add(side === OPP[LEFT[dst.dir]] ? tl.L : tl.R, items)) touch(I.qx, I.qy);
    } else if (dst.t === "machine") {
      const m = machIn.get(dst) ?? new Set<string>();
      machIn.set(dst, m);
      add(m, items);
    }
  };
  for (const e of ents)
    if (beltLike(e))
      for (const [x, y] of btiles(e)) {
        const l = lane(x, y);
        if (l.L.size || l.R.size) enqueue(tkey(x, y));
      }
  for (const e of inserters) runInserter(e);
  for (let i = 0; i < queue.length; i++) {
    const k = queue[i] as string;
    queued.delete(k);
    const e = G.get(k);
    if (!beltLike(e)) continue;
    const [x, y] = k.split(",").map(Number) as [number, number];
    const s = lane(x, y);
    if (s.L.size || s.R.size) {
      const tg = target(e, x, y);
      if (tg && transfer(e, s, tg[0], tg[1], tg[2])) touch(tg[0], tg[1]);
    }
    for (const ins of pickers.get(k) ?? []) runInserter(ins);
  }
  // machines some inserter picks up from, i.e. that have an output inserter
  const picked = new Set<EdEnt>();
  for (const e of inserters) {
    const p = insEnds(e);
    const src = at(p.px, p.py);
    if (src) picked.add(src);
  }
  const checks: Check[] = [];
  for (const m of ents) {
    if (m.t !== "machine") continue;
    const rec = plannedRecipe(m.item, m.recipe ?? undefined);
    if (!rec) throw new Error(`laneSim: unknown recipe ${m.item}`);
    const need = Object.keys(rec.ingredients).filter((i) => !isFluid(i));
    if (/^(stone|steel)-furnace$/.test(m.ent)) need.push("coal");
    const got = machIn.get(m) ?? new Set<string>();
    const missing = need.filter((i) => !got.has(i));
    const hasOut = isFluid(m.item) || picked.has(m);
    if (missing.length)
      checks.push({
        x: m.x + 1,
        y: m.y + 1,
        m,
        text: `${itemName(m.item)} machine is missing ${missing.map(itemName).join(", ")}.`,
      });
    if (!hasOut)
      checks.push({
        x: m.x + 1,
        y: m.y + 1,
        m,
        text: `${itemName(m.item)} machine has no output inserter.`,
      });
  }
  const mixed: EdEnt[] = [];
  for (const e of ents)
    if (beltLike(e)) {
      const l = lane(e.x, e.y);
      if (l.L.size > 1 || l.R.size > 1) mixed.push(e);
    }
  if (mixed.length && mixed[0])
    checks.push({
      x: mixed[0].x,
      y: mixed[0].y,
      text: `${mixed.length} belt tile${mixed.length > 1 ? "s carry" : " carries"} a mixed lane. Click to jump to the first one.`,
    });
  for (const e of ents)
    if (e.t === "ug" && !pair.has(e))
      checks.push({
        x: e.x,
        y: e.y,
        text: `Underground ${e.io === "input" ? "entrance" : "exit"} has no partner within ${U} tiles.`,
      });
  for (const n of [...notes].sort()) checks.push({ text: n });
  return { G, LN, pair, checks, mixedSet: new Set(mixed), insEnds };
}
