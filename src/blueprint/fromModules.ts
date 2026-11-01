// Module graph -> layout input. Ported from artifacts/FCP_v1-2.html (lines 1424-1473).
// Unlike the artifact, nothing here reads globals or writes back into the saved layout.
import { fmt } from "../data/format.ts";
import { machine } from "../data/game.ts";
import { MACH_ENTITY, short } from "../data/legacy.ts";
import type { MachineKey } from "../data/legacy.ts";
import { simulate } from "../modules/simulate.ts";
import type { Simulation } from "../modules/simulate.ts";
import type { MachineNode, ModuleGraph, ModuleNode } from "../modules/types.ts";

/** Per-layout blueprint settings (saved as `L.bp`). */
export interface BpSettings {
  scope: string; // "all" or a machine node id
  belt: string; // key of BELT_TIERS
  ins: string; // key of INSERTERS
  maxRow: number;
}

/** What `bpSettings()` did in the artifact: fill in defaults, with the calculator's belt tier. */
export function resolveBpSettings(
  saved: Partial<BpSettings> | undefined,
  calcBelt: string,
): BpSettings {
  return { scope: "all", belt: calcBelt, ins: "fast", maxRow: 12, ...saved };
}

export interface BuildMachine {
  name: string;
  speed: number;
  ent: string;
  size: number;
  burner: boolean;
}

export interface BuildEntry {
  id: string; // item made
  rate: number; // items/s
  depth: number;
  exact: number; // fractional machine count
  count: number;
  machine: BuildMachine;
  mach: MachineKey;
}

export interface Solution {
  build: BuildEntry[];
  inputs: Map<string, { rate: number }>;
  warn: string[];
  title: string;
  icon: string | null | undefined;
  final: string | null | undefined;
  label: string;
}

export function graphDepth(S: Simulation): (id: string) => number {
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const d = (id: string): number => {
    const hit = memo.get(id);
    if (hit !== undefined) return hit;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let v = 0;
    for (const e of S.outE.get(id) ?? []) {
      const t = S.byId.get(e.to);
      if (t && t.kind === "machine") v = Math.max(v, d(t.id) + 1);
    }
    visiting.delete(id);
    memo.set(id, v);
    return v;
  };
  return d;
}

export function bpEntry(n: MachineNode, S: Simulation, depth: number): BuildEntry {
  const r = S.N[n.id];
  const machId = MACH_ENTITY[n.mach];
  if (!r) throw new Error(`bpEntry: no simulation result for node ${n.id}`);
  if (!machId) throw new Error(`bpEntry: unknown machine ${n.mach}`);
  const m = machine(machId);
  const cnt = Number(n.count) || 0;
  const T = r.T > 0 ? r.T : r.maxOut;
  return {
    id: n.item,
    rate: T,
    depth,
    exact: r.maxOut > 0 ? (cnt * T) / r.maxOut : 0,
    count: Math.ceil(cnt - 1e-9),
    machine: { name: m.name, speed: m.speed, ent: m.id, size: m.size, burner: m.burner },
    mach: n.mach,
  };
}

function nodeLabel(n: ModuleNode): string {
  if (n.kind === "machine") return `${fmt(Number(n.count) || 0, 2)}× ${short(n.item)}`;
  if (n.kind === "source") return `${short(n.item)} source`;
  return "Output";
}

/**
 * Artifact difference: when `bp.scope` names a node that no longer exists, the artifact also
 * rewrote the saved `bp.scope` to "all". Here the caller decides whether to do that.
 */
export function bpSolution(L: ModuleGraph, bp: BpSettings): Solution {
  const S = simulate(L);
  const depth = graphDepth(S);
  const warn: string[] = [];
  const inputs = new Map<string, { rate: number }>();
  const add = (id: string, rate: number) => {
    const c = inputs.get(id) ?? { rate: 0 };
    c.rate += rate;
    inputs.set(id, c);
  };
  if (bp.scope !== "all") {
    const n = L.nodes.find((x): x is MachineNode => x.id === bp.scope && x.kind === "machine");
    if (n) {
      const e = bpEntry(n, S, 0);
      const r = S.N[n.id];
      if (!r) throw new Error(`bpSolution: no simulation result for node ${n.id}`);
      const frac = r.maxOut ? e.rate / r.maxOut : 0;
      for (const [i, nd] of Object.entries(r.need)) add(i, nd * frac);
      return {
        build: e.count ? [e] : [],
        inputs,
        warn,
        title: `Module · ${nodeLabel(n)}`,
        icon: n.item,
        final: n.item,
        label: `${short(n.item)} module`,
      };
    }
  }
  const byItem = new Map<string, BuildEntry>();
  for (const n of L.nodes) {
    if (n.kind !== "machine") continue;
    const e = bpEntry(n, S, depth(n.id));
    const c = byItem.get(e.id);
    if (!c) {
      byItem.set(e.id, e);
      continue;
    }
    if (c.mach !== e.mach)
      warn.push(
        `${short(e.id)} is made in more than one building type. The whole-chain layout uses ${c.machine.name} for all of them.`,
      );
    c.rate += e.rate;
    c.exact += e.exact;
    c.count += e.count;
    c.depth = Math.max(c.depth, e.depth);
  }
  for (const n of L.nodes) if (n.kind === "source") add(n.item, S.N[n.id]?.sent ?? 0);
  const build = [...byItem.values()].filter((b) => b.count > 0);
  const fin = build.filter((b) => b.depth === 0).sort((a, b) => b.rate - a.rate)[0];
  return {
    build,
    inputs,
    warn,
    title: `Whole chain · ${L.name}`,
    icon: fin && fin.id,
    final: fin && fin.id,
    label: L.name || "Chain",
  };
}
