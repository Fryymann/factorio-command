// Labels for a whole-chain edit, so edit mode keeps what the generated view shows: where each
// item enters, where each product belt starts, which rows make what, and what comes out.
// Derived from the entities and their lane simulation, so they follow the edits.
import { plannedRecipe } from "../data/game.ts";
import { DV, tkey } from "./geometry.ts";
import type { Check, LaneSimResult } from "./laneSim.ts";
import type { EdEnt } from "./types.ts";

export interface BeltLabel {
  x: number;
  y: number;
  item: string;
}

export interface RowLabel {
  item: string;
  x: number; // west edge of the cluster
  y: number; // north edge
  count: number; // machines in the cluster
}

export interface Annotations {
  /** Belts marked as an item entry. */
  feeds: BeltLabel[];
  /** Start of a belt that carries one item and isn't fed by another belt, e.g. a row's output belt. */
  products: BeltLabel[];
  /** End of a belt that carries one item nothing in the chain uses: what the chain delivers. */
  outputs: BeltLabel[];
  /** Runs of machines of one item on one row. */
  rows: RowLabel[];
}

type Belt = EdEnt & { t: "belt" | "ug" | "splitter" };
const isBelt = (e: EdEnt | undefined): e is Belt =>
  !!e && (e.t === "belt" || e.t === "ug" || e.t === "splitter");

function singleItem(sim: LaneSimResult, e: EdEnt): string | null {
  const l = sim.LN.get(tkey(e.x, e.y));
  if (!l) return null;
  const all = new Set([...l.L, ...l.R]);
  return all.size === 1 ? ([...all][0] as string) : null;
}

export function annotate(ents: EdEnt[], sim: LaneSimResult): Annotations {
  const at = (x: number, y: number) => sim.G.get(tkey(x, y));
  const carries = (x: number, y: number): boolean => {
    const l = sim.LN.get(tkey(x, y));
    return !!l && (l.L.size > 0 || l.R.size > 0);
  };
  /** Another belt that carries something runs into (x, y). */
  const fed = (x: number, y: number): boolean => {
    const e = at(x, y);
    if (e && e.t === "ug" && e.io === "output") {
      const from = sim.pair.get(e);
      if (from && carries(from.x, from.y)) return true;
    }
    for (const [dx, dy] of Object.values(DV)) {
      const px = x - dx;
      const py = y - dy;
      const n = at(px, py);
      if (!isBelt(n) || (n.t === "ug" && n.io === "input")) continue;
      const [ndx, ndy] = DV[n.dir];
      if (px + ndx === x && py + ndy === y && carries(px, py)) return true;
    }
    return false;
  };
  const continues = (e: Belt): boolean => {
    if (e.t === "ug" && e.io === "input") return sim.pair.has(e);
    const [dx, dy] = DV[e.dir];
    return isBelt(at(e.x + dx, e.y + dy));
  };

  const consumed = new Set<string>();
  for (const e of ents)
    if (e.t === "machine")
      for (const i of Object.keys(plannedRecipe(e.item)?.ingredients ?? {})) consumed.add(i);
  const out: Annotations = { feeds: [], products: [], outputs: [], rows: [] };
  for (const e of ents) {
    if (e.t === "belt" && e.feed) out.feeds.push({ x: e.x, y: e.y, item: e.feed });
    if (!isBelt(e) || e.t === "splitter") continue;
    const item = singleItem(sim, e);
    if (!item) continue;
    if (e.t === "belt" && !e.feed && !fed(e.x, e.y)) out.products.push({ x: e.x, y: e.y, item });
    if (!continues(e) && !consumed.has(item)) out.outputs.push({ x: e.x, y: e.y, item });
  }

  // machine clusters: same item, same top row, touching side by side
  const machines = ents
    .filter((e): e is EdEnt & { t: "machine" } => e.t === "machine")
    .sort((a, b) => a.y - b.y || a.x - b.x);
  let run: RowLabel | null = null;
  let runEnd = 0;
  let runItem = "";
  let runY = 0;
  for (const m of machines) {
    if (run && m.item === runItem && m.y === runY && m.x === runEnd) {
      run.count++;
      runEnd = m.x + m.w;
      continue;
    }
    run = { item: m.item, x: m.x, y: m.y, count: 1 };
    runItem = m.item;
    runY = m.y;
    runEnd = m.x + m.w;
    out.rows.push(run);
  }
  return out;
}

export interface CheckGroup {
  /** Item of the machine the checks are about, or null for checks about belts and notes. */
  item: string | null;
  checks: Check[];
}

/** Groups lane-sim checks by the item of the machine they concern, keeping their order. */
export function groupChecks(checks: Check[]): CheckGroup[] {
  const groups = new Map<string | null, Check[]>();
  for (const c of checks) {
    const key = c.m && c.m.t === "machine" ? c.m.item : null;
    const list = groups.get(key);
    if (list) list.push(c);
    else groups.set(key, [c]);
  }
  return [...groups].map(([item, list]) => ({ item, checks: list }));
}
