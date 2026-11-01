// Flow simulation for the module graph. Ported unchanged from `simulate` in
// artifacts/FCP_v1-2.html (lines 737-821).
// Pass 1 (downstream -> upstream): how much each block is asked to make.
// Pass 2 (upstream -> downstream): how much actually arrives, limited by supply and belts.
import { GAME, belt, isFluid, machine, plannedRecipe, productOf } from "../data/game.ts";
import type { ModuleEdge, ModuleGraph, ModuleNode } from "./types.ts";

const EPS = 1e-6;

export interface NodeResult {
  maxOut: number;
  need: Record<string, number>;
  recv: Record<string, number>;
  T: number; // target output rate
  A: number; // actual output rate
  down: number;
  sent: number;
  starved: boolean;
  limits: string[];
  missing: string[];
}

export interface EdgeResult {
  item: string | null;
  cap: number;
  wanted: number;
  req: number;
  flow: number;
  unused: boolean;
  beltLimited: boolean;
}

export interface Simulation {
  N: Record<string, NodeResult>;
  E: Record<string, EdgeResult>;
  byId: Map<string, ModuleNode>;
  inE: Map<string, ModuleEdge[]>;
  outE: Map<string, ModuleEdge[]>;
  cyclic: boolean;
}

function mustGet<K, V>(m: Map<K, V>, k: K): V {
  const v = m.get(k);
  if (v === undefined) throw new Error(`simulate: missing entry ${String(k)}`);
  return v;
}

export function simulate(L: ModuleGraph): Simulation {
  const byId = new Map(L.nodes.map((n) => [n.id, n]));
  const edges = L.edges.filter((e) => byId.has(e.from) && byId.has(e.to));
  const inE = new Map<string, ModuleEdge[]>();
  const outE = new Map<string, ModuleEdge[]>();
  L.nodes.forEach((n) => {
    inE.set(n.id, []);
    outE.set(n.id, []);
  });
  edges.forEach((e) => {
    mustGet(outE, e.from).push(e);
    mustGet(inE, e.to).push(e);
  });

  const indeg = new Map(L.nodes.map((n) => [n.id, mustGet(inE, n.id).length]));
  const order: string[] = [];
  const q = L.nodes.filter((n) => !indeg.get(n.id)).map((n) => n.id);
  while (q.length) {
    const id = q.shift() as string;
    order.push(id);
    for (const e of mustGet(outE, id)) {
      indeg.set(e.to, mustGet(indeg, e.to) - 1);
      if (indeg.get(e.to) === 0) q.push(e.to);
    }
  }
  const cyclic = order.length < L.nodes.length;
  if (cyclic)
    L.nodes.forEach((n) => {
      if (!order.includes(n.id)) order.push(n.id);
    });

  const N: Record<string, NodeResult> = {};
  const E: Record<string, EdgeResult> = {};
  for (const n of L.nodes) {
    const r: NodeResult = {
      maxOut: 0,
      need: {},
      recv: {},
      T: 0,
      A: 0,
      down: 0,
      sent: 0,
      starved: false,
      limits: [],
      missing: [],
    };
    if (n.kind === "machine") {
      const rec = plannedRecipe(n.item);
      if (!rec) throw new Error(`simulate: unknown recipe ${n.item}`);
      if (!GAME.machines[n.mach]) throw new Error(`simulate: unknown machine ${n.mach}`);
      const cps = (Math.max(0, Number(n.count) || 0) * machine(n.mach).speed) / rec.time;
      r.maxOut = cps * productOf(rec, n.item);
      for (const [i, qty] of Object.entries(rec.ingredients)) {
        r.need[i] = cps * qty;
        r.recv[i] = 0;
      }
    } else if (n.kind === "source") r.maxOut = Math.max(0, Number(n.rate) || 0);
    N[n.id] = r;
  }
  const nr = (id: string): NodeResult => {
    const r = N[id];
    if (!r) throw new Error(`simulate: no result for node ${id}`);
    return r;
  };
  const er = (id: string): EdgeResult => {
    const r = E[id];
    if (!r) throw new Error(`simulate: no result for edge ${id}`);
    return r;
  };
  const itemOf = (id: string) => mustGet(byId, id).item;
  edges.forEach((e) => {
    const item = itemOf(e.from);
    E[e.id] = {
      item,
      cap: item && isFluid(item) ? Infinity : belt(e.belt).itemsPerSecond,
      wanted: 0,
      req: 0,
      flow: 0,
      unused: false,
      beltLimited: false,
    };
  });

  for (const id of [...order].reverse()) {
    const n = mustGet(byId, id);
    const r = nr(id);
    if (n.kind === "output") {
      for (const e of mustGet(inE, id)) {
        const s = er(e.id);
        s.wanted = nr(e.from).maxOut;
        s.req = Math.min(s.cap, s.wanted);
      }
      continue;
    }
    r.down = mustGet(outE, id).reduce((s, e) => s + er(e.id).req, 0);
    r.T = mustGet(outE, id).length ? Math.min(r.maxOut, r.down) : r.maxOut;
    if (n.kind !== "machine") continue;
    const frac = r.maxOut > 0 ? r.T / r.maxOut : 0;
    for (const e of mustGet(inE, id)) {
      const item = er(e.id).item;
      if (item && r.need[item] === undefined) er(e.id).unused = true;
    }
    for (const [i, nd] of Object.entries(r.need)) {
      const es = mustGet(inE, id).filter((e) => er(e.id).item === i);
      if (!es.length) {
        r.missing.push(i);
        continue;
      }
      const W = es.reduce((s, e) => s + nr(e.from).maxOut, 0);
      es.forEach((e) => {
        const s = er(e.id);
        s.wanted = nd * frac * (W > 0 ? nr(e.from).maxOut / W : 1 / es.length);
        s.req = Math.min(s.cap, s.wanted);
      });
    }
  }

  for (const id of order) {
    const n = mustGet(byId, id);
    const r = nr(id);
    if (n.kind === "output") continue;
    if (n.kind === "machine") {
      const frac = r.maxOut > 0 ? r.T / r.maxOut : 0;
      let f = r.T > 0 ? 1 : 0;
      for (const [i, nd] of Object.entries(r.need)) {
        const want = nd * frac;
        if (want <= 0) continue;
        const g = (r.recv[i] ?? 0) / want;
        if (g < 1 - EPS) r.limits.push(i);
        f = Math.min(f, g);
      }
      r.A = r.T * Math.max(0, Math.min(1, f));
      r.starved = r.T > 0 && r.A < r.T * (1 - EPS);
    } else r.A = r.T;
    const outs = mustGet(outE, id);
    const sumReq = outs.reduce((s, e) => s + er(e.id).req, 0);
    const k = sumReq > r.A ? (sumReq > 0 ? r.A / sumReq : 0) : 1;
    for (const e of outs) {
      const s = er(e.id);
      s.flow = s.req * k;
      r.sent += s.flow;
      s.beltLimited = s.wanted > s.cap * (1 + EPS);
      const t = nr(e.to);
      if (s.item) t.recv[s.item] = (t.recv[s.item] ?? 0) + s.flow;
    }
  }
  return { N, E, byId, inE, outE, cyclic };
}
