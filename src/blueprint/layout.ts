// Tile layout generator. Ported unchanged from `planLayout` in artifacts/FCP_v1-2.html
// (lines 1233-1387), which was itself adapted from a friend's version of the planner.
// Coordinates are tiles; x grows east, y grows south. Rates are per second.
import { GAME, beltByKey, isFluid, machine, plannedRecipe, productOf } from "../data/game.ts";
import type { BeltTier } from "../data/game.ts";
import { INSERTERS, LONG, nm } from "../data/legacy.ts";
import type { InserterType } from "../data/legacy.ts";
import type { BuildEntry, Solution } from "./fromModules.ts";

export type Dir = "N" | "E" | "S" | "W";

export interface LayoutSettings {
  belt: string;
  ins: string;
  maxRow: number | string;
}

export interface Ingredient {
  id: string;
  per: number; // items/s per machine
  fuel?: true;
}

export interface Lanes {
  n: string | undefined;
  s: string | undefined;
}

export type LayoutEnt =
  | {
      t: "belt";
      x: number;
      y: number;
      w: 1;
      h: 1;
      dir: Dir;
      item: string | null;
      lanes: Lanes | undefined;
    }
  | { t: "ug"; x: number; y: number; w: 1; h: 1; dir: Dir; io: "input" | "output"; item: string }
  | { t: "splitter"; x: number; y: number; w: 2; h: 1; dir: Dir; item: string }
  | { t: "ins"; x: number; y: number; w: 1; h: 1; ins: InserterType; long?: true; out?: true }
  | { t: "pole"; x: number; y: number; w: 1; h: 1 }
  | {
      t: "machine";
      x: number;
      y: number;
      w: number;
      h: number;
      item: string;
      ent: string;
      mname: string;
      recipe: string | null;
    }
  | { t: "pipe"; x: number; y: number; w: 1; h: 1; item: string; pdir: "in" | "out" };

export interface Column {
  item: string;
  k: number;
  x: number;
  raw: boolean;
  start: number | null;
  uses: number[];
  rate: number;
  end?: number;
}

export interface RowPlan {
  id: string;
  b: BuildEntry;
  n: number;
  w: number;
  ent: string;
  mname: string;
  recipe: string | null;
  A: Ingredient[];
  C: Ingredient[];
  fluids: Ingredient[];
  fluidOut: boolean;
  outPer: number;
  part: number;
  parts: number;
  loadA: number;
  loadC: number;
  twoA: boolean;
  twoOut: boolean;
  rowWarn: string[];
}

export interface FeedLine {
  item: string;
  y: number;
  kind: "A-n" | "A-s" | "C-n" | "C-s";
}

export interface Row extends RowPlan {
  T: number;
  yA: number | null;
  yC: number | null;
  yI: number;
  yM: number;
  yO: number | null;
  yB: number | null;
  pipes: { item: string; y: number; dir: "in" | "out" }[];
  lines: FeedLine[];
  hasC: boolean;
  rowEnd: number;
  jxC: number;
  bottom: number;
}

export interface Layout {
  ents: LayoutEnt[];
  G: Map<string, LayoutEnt>;
  cols: Column[];
  rows: Row[];
  pairs: { y: number; a: number; b: number }[];
  W: number;
  H: number;
  xb: number;
  jxA: number;
  rowX0: number;
  warn: string[];
  conflicts: number;
  counts: Record<"belt" | "ug" | "splitter" | "ins" | "long" | "pole" | "machine" | "pipe", number>;
  tier: BeltTier;
  insT: InserterType;
}

/** Coal per second for one burner machine working flat out: its power over coal's fuel value. */
function burnerFuel(machineId: string): number {
  const coal = GAME.items.coal?.fuelValue;
  if (!coal) throw new Error("planLayout: no fuel value for coal in the game data");
  return machine(machineId).energyUsage / coal;
}

export function planLayout(sol: Pick<Solution, "build" | "inputs">, st: LayoutSettings): Layout {
  const tier = beltByKey(st.belt);
  const laneCap = tier.itemsPerSecond / 2;
  const U = tier.U;
  const insT = (INSERTERS as Record<string, InserterType>)[st.ins] ?? INSERTERS.fast;
  const warn: string[] = [];
  const recs = [...sol.build].sort((a, b) => b.depth - a.depth || (a.id < b.id ? -1 : 1));
  const made = new Set(recs.map((b) => b.id));
  const maxRow = Math.max(1, Math.floor(Number(st.maxRow) || 12));
  const plans: RowPlan[] = [];
  for (const b of recs) {
    const r = plannedRecipe(b.id);
    if (!r) throw new Error(`planLayout: unknown recipe ${b.id}`);
    const m = b.machine;
    const w = m.size;
    const u = b.count ? b.exact / b.count : 0;
    const cps = (m.speed / r.time) * u; // crafts per second per machine at the planned rate
    const ings: Ingredient[] = Object.entries(r.ingredients).map(([id, q]) => ({
      id,
      per: q * cps,
    }));
    if (r.categories.includes("smelting") && m.burner)
      ings.push({ id: "coal", per: burnerFuel(m.ent) * u, fuel: true });
    const solids = ings.filter((i) => !isFluid(i.id)).sort((a, c) => c.per - a.per);
    const fluids = ings.filter((i) => isFluid(i.id));
    const fluidOut = isFluid(b.id);
    const outPer = productOf(r, b.id) * cps;
    if (solids.length > 4)
      warn.push(`${nm(b.id)} has more than four solid ingredients; only four are belted.`);
    let cap = maxRow;
    for (const s of solids) cap = Math.min(cap, Math.floor(laneCap / s.per + 1e-9));
    if (!fluidOut) cap = Math.min(cap, Math.floor(laneCap / outPer + 1e-9));
    if (cap < 1) {
      cap = 1;
      warn.push(`One ${nm(b.id)} machine needs more than a full belt lane. Pick a faster belt.`);
    }
    const nRows = Math.max(1, Math.ceil(b.count / cap));
    const A = solids.slice(0, 2);
    const C = solids.slice(2, 4);
    const loadA = A.reduce((s, x) => s + x.per, 0);
    const loadC = C.reduce((s, x) => s + x.per, 0);
    const twoA = w === 3 && C.length === 0 && loadA > insT.cap;
    const twoOut = w === 3 && !fluidOut && outPer > insT.cap;
    const rowWarn: string[] = [];
    if (loadA > insT.cap * (twoA ? 2 : 1))
      rowWarn.push(
        `Input inserters are too slow (${loadA.toFixed(2)}/s per machine). Use a faster inserter.`,
      );
    if (loadC > LONG.cap)
      rowWarn.push(`Long-handed inserter can't keep up (${loadC.toFixed(2)}/s per machine).`);
    if (!fluidOut && outPer > insT.cap * (twoOut ? 2 : 1))
      rowWarn.push(`Output inserters are too slow (${outPer.toFixed(2)}/s per machine).`);
    let left = b.count;
    for (let i = 0; i < nRows; i++) {
      const n = Math.ceil(left / (nRows - i));
      left -= n;
      plans.push({
        id: b.id,
        b,
        n,
        w,
        ent: m.ent,
        mname: m.name,
        recipe: r.categories.includes("smelting") ? null : b.id, // furnaces pick their recipe
        A,
        C,
        fluids,
        fluidOut,
        outPer,
        part: i,
        parts: nRows,
        loadA,
        loadC,
        twoA,
        twoOut,
        rowWarn,
      });
    }
  }

  // bus columns: raw inputs first, then one per solid product in row order
  const cols: Column[] = [];
  const colOf = new Map<string, Column>();
  const addCol = (item: string, raw: boolean): Column => {
    const c: Column = {
      item,
      k: cols.length,
      x: 3 * cols.length,
      raw,
      start: raw ? 0 : null,
      uses: [],
      rate: 0,
    };
    cols.push(c);
    colOf.set(item, c);
    return c;
  };
  const col = (item: string): Column => {
    const c = colOf.get(item);
    if (!c) throw new Error(`planLayout: no bus column for ${item}`);
    return c;
  };
  for (const p of plans)
    for (const s of [...p.A, ...p.C]) if (!made.has(s.id) && !colOf.has(s.id)) addCol(s.id, true);
  for (const b of recs) if (!isFluid(b.id)) addCol(b.id, false);
  const xb = 3 * cols.length;
  const jxA = xb + 2;
  const rowX0 = jxA + 2;

  // row geometry
  let y = 2;
  const rows: Row[] = [];
  for (const p of plans) {
    const T = y;
    const hasC = p.C.length > 0;
    const lines: FeedLine[] = [];
    let yA: number | null = null;
    let yC: number | null = null;
    let yI: number;
    const A0 = p.A[0];
    const A1 = p.A[1];
    const C0 = p.C[0];
    const C1 = p.C[1];
    if (hasC && C0 && A0) {
      yC = T + 5;
      yA = T + 6;
      yI = T + 7;
      if (C1) lines.push({ item: C1.id, y: T + 1, kind: "C-s" });
      lines.push({ item: C0.id, y: T + 3, kind: "C-n" });
      lines.push({ item: A0.id, y: yC, kind: "A-n" });
      if (A1) lines.push({ item: A1.id, y: yI, kind: "A-s" });
    } else if (A0) {
      yA = T + 2;
      yI = T + 3;
      lines.push({ item: A0.id, y: T + 1, kind: "A-n" });
      if (A1) lines.push({ item: A1.id, y: yI, kind: "A-s" });
    } else yI = T + 1;
    const yM = yI + 1;
    const h = p.w;
    let next = yM + h;
    let yO: number | null = null;
    let yB: number | null = null;
    if (!p.fluidOut) {
      yO = next;
      yB = next + 1;
      next += 2;
    }
    const pipes: Row["pipes"] = [];
    for (const f of p.fluids) pipes.push({ item: f.id, y: next++, dir: "in" });
    if (p.fluidOut) pipes.push({ item: p.id, y: next++, dir: "out" });
    const rowEnd = rowX0 + p.n * p.w - 1;
    const jxC = rowEnd + 2;
    rows.push({
      ...p,
      T,
      yA,
      yC,
      yI,
      yM,
      yO,
      yB,
      pipes,
      lines,
      hasC,
      rowEnd,
      jxC,
      bottom: next - 1,
    });
    for (const L of lines) col(L.item).uses.push(L.y);
    if (!p.fluidOut && p.part === 0) col(p.id).start = yB;
    y = next + 1;
  }
  const maxY = y;
  for (const c of cols) c.uses.sort((a, b) => a - b);
  for (const [id, v] of sol.inputs) {
    const c = colOf.get(id);
    if (c) c.rate = v.rate;
  }
  for (const b of recs) {
    const c = colOf.get(b.id);
    if (c) c.rate = b.rate;
  }
  for (const c of cols)
    if (c.rate > tier.itemsPerSecond + 1e-9)
      warn.push(
        `${nm(c.item)} needs ${(c.rate / tier.itemsPerSecond).toFixed(2)} belts on the bus. The layout draws one, so double that column or use a faster belt.`,
      );

  // placement
  const G = new Map<string, LayoutEnt>();
  const ents: LayoutEnt[] = [];
  const pairs: Layout["pairs"] = [];
  let conflicts = 0;
  const key = (x: number, yy: number) => x + "," + yy;
  const put = <T extends LayoutEnt>(e: T): T => {
    for (let dx = 0; dx < e.w; dx++)
      for (let dy = 0; dy < e.h; dy++) {
        const k = key(e.x + dx, e.y + dy);
        if (G.has(k)) conflicts++;
        G.set(k, e);
      }
    ents.push(e);
    return e;
  };
  const belt = (x: number, yy: number, dir: Dir, item: string | null, lanes?: Lanes) =>
    put({ t: "belt", x, y: yy, w: 1, h: 1, dir, item, lanes });

  for (const r of rows) {
    const w = r.w;
    for (let i = 0; i < r.n; i++) {
      const mx = rowX0 + i * w;
      put({
        t: "machine",
        x: mx,
        y: r.yM,
        w,
        h: w,
        item: r.id,
        ent: r.ent,
        mname: r.mname,
        recipe: r.recipe,
      });
      if (w === 3) {
        if (r.A.length) put({ t: "ins", x: mx, y: r.yI, w: 1, h: 1, ins: insT });
        if (r.hasC) put({ t: "ins", x: mx + 1, y: r.yI, w: 1, h: 1, ins: LONG, long: true });
        else if (r.twoA) put({ t: "ins", x: mx + 1, y: r.yI, w: 1, h: 1, ins: insT });
        put({ t: "pole", x: mx + 2, y: r.yI, w: 1, h: 1 });
        if (!r.fluidOut && r.yO !== null) {
          put({ t: "ins", x: mx, y: r.yO, w: 1, h: 1, ins: insT, out: true });
          if (r.twoOut) put({ t: "ins", x: mx + 1, y: r.yO, w: 1, h: 1, ins: insT, out: true });
          put({ t: "pole", x: mx + 2, y: r.yO, w: 1, h: 1 });
        }
      } else {
        if (r.A.length) put({ t: "ins", x: mx, y: r.yI, w: 1, h: 1, ins: insT });
        put({ t: "pole", x: mx + 1, y: r.yI, w: 1, h: 1 });
        if (!r.fluidOut && r.yO !== null) {
          put({ t: "ins", x: mx, y: r.yO, w: 1, h: 1, ins: insT, out: true });
          put({ t: "pole", x: mx + 1, y: r.yO, w: 1, h: 1 });
        }
      }
    }
    if (r.yA !== null)
      for (let x = jxA; x <= r.rowEnd; x++)
        belt(x, r.yA, "E", null, { n: r.A[0]?.id, s: r.A[1]?.id });
    if (r.hasC && r.C[0])
      for (let x = r.jxC; x >= rowX0; x--)
        belt(x, r.yC as number, "W", null, { n: r.C[0].id, s: r.C[1]?.id });
    if (!r.fluidOut && r.yB !== null) {
      const c = col(r.id);
      for (let x = r.rowEnd; x > c.x; x--) belt(x, r.yB, "W", r.id);
      if (r.part === 0) belt(c.x, r.yB, "S", r.id);
    }
    for (const p of r.pipes)
      for (let x = rowX0 - 1; x <= r.rowEnd; x++)
        put({ t: "pipe", x, y: p.y, w: 1, h: 1, item: p.item, pdir: p.dir });
  }

  for (const c of cols) {
    const last = c.uses.length ? (c.uses[c.uses.length - 1] as number) : null;
    const splitYs = new Set(c.uses.slice(0, -1).map((u) => u - 1));
    const from = c.raw ? 0 : (c.start as number) + 1;
    const to = last !== null ? last - 1 : maxY;
    c.end = last !== null ? last : maxY;
    for (let yy = from; yy <= to; yy++) {
      if (splitYs.has(yy))
        put({ t: "splitter", x: c.x, y: yy, w: 2, h: 1, dir: "S", item: c.item });
      else belt(c.x, yy, "S", c.item);
    }
    if (last !== null) belt(c.x, last, "E", c.item);
  }

  for (const r of rows)
    for (const L of r.lines) {
      const c = col(L.item);
      const yy = L.y;
      const item = L.item;
      belt(c.x + 1, yy, "E", item);
      const tx = L.kind === "C-n" ? r.jxC : L.kind === "C-s" ? r.jxC + 1 : jxA;
      const obs: number[] = [];
      for (let x = c.x + 2; x < xb; x++) if (G.has(key(x, yy))) obs.push(x);
      let x = c.x + 2;
      if (obs.length) {
        const f = (obs[obs.length - 1] as number) + 1;
        let ent = x;
        put({ t: "ug", x: ent, y: yy, w: 1, h: 1, dir: "E", io: "input", item });
        for (let guard = 0; guard < 200; guard++) {
          if (f - ent - 1 <= U) {
            put({ t: "ug", x: f, y: yy, w: 1, h: 1, dir: "E", io: "output", item });
            pairs.push({ y: yy, a: ent, b: f });
            break;
          }
          let cand: number | null = null;
          for (let cc = ent + 1 + U; cc > ent; cc--)
            if (cc % 3 === 1 && cc + 1 < f && !G.has(key(cc, yy)) && !G.has(key(cc + 1, yy))) {
              cand = cc;
              break;
            }
          if (cand === null) {
            warn.push(`Couldn't route ${nm(item)} across the bus at row ${yy}.`);
            break;
          }
          put({ t: "ug", x: cand, y: yy, w: 1, h: 1, dir: "E", io: "output", item });
          pairs.push({ y: yy, a: ent, b: cand });
          put({ t: "ug", x: cand + 1, y: yy, w: 1, h: 1, dir: "E", io: "input", item });
          ent = cand + 1;
        }
        x = f + 1;
      }
      for (; x < tx; x++) belt(x, yy, "E", item);
      if (L.kind === "A-n") belt(jxA, yy, "S", item);
      else if (L.kind === "A-s") belt(jxA, yy, "N", item);
      else if (L.kind === "C-n") {
        belt(r.jxC, yy, "S", item);
        belt(r.jxC, yy + 1, "S", item);
      } else {
        const yA = r.yA as number;
        for (let k = yy; k < yA; k++) belt(r.jxC + 1, k, "S", item);
        belt(r.jxC + 1, yA, "W", item);
        belt(r.jxC, yA, "N", item);
      }
    }

  let W = 0;
  for (const e of ents) W = Math.max(W, e.x + e.w);
  const counts: Layout["counts"] = {
    belt: 0,
    ug: 0,
    splitter: 0,
    ins: 0,
    long: 0,
    pole: 0,
    machine: 0,
    pipe: 0,
  };
  for (const e of ents) {
    if (e.t === "ins" && e.long) counts.long++;
    else counts[e.t]++;
  }
  return {
    ents,
    G,
    cols,
    rows,
    pairs,
    W,
    H: maxY + 1,
    xb,
    jxA,
    rowX0,
    warn,
    conflicts,
    counts,
    tier,
    insT,
  };
}
