// Calculator chain -> connected module graph, and the small rules the Modules tab needs.
// Ported from `layoutFromCalc`, `defaultMach`, `machOptions` and `newLayout`
// (artifacts/FCP_v1-2.html, lines 664-678, 689 and 702-735). Pure: ids come from the caller.
import { machinesFor, plannedRecipe } from "../data/game.ts";
import { MACH_ENTITY, MACH_KEYS } from "../data/legacy.ts";
import type { MachineKey } from "../data/legacy.ts";
import { machineFor } from "../solver/solve.ts";
import type { AsmSpeed, FurnaceKey, Plan } from "../solver/solve.ts";
import type { MachineNode, ModuleEdge, ModuleNode, OutputNode, SourceNode } from "./types.ts";
import type { SavedLayout } from "./storage.ts";

export const NODE_W = 224;

export type PlacedNode = ModuleNode & { x: number; y: number };
export interface View {
  x: number;
  y: number;
  z: number;
}
/** A saved layout as the Modules tab uses it: every node has a position. */
export interface PlacedLayout extends SavedLayout {
  nodes: PlacedNode[];
  view: View;
  needsFit?: boolean;
}

export const ASM_KEY: Record<AsmSpeed, MachineKey> = { "0.5": "am1", "0.75": "am2", "1.25": "am3" };
export { MACH_KEYS };

function recipeOf(item: string) {
  const r = plannedRecipe(item);
  if (!r) throw new Error(`No recipe for "${item}"`);
  return r;
}

/** Building types that can run this item's recipe. */
export function machOptions(item: string): MachineKey[] {
  const ids = machinesFor(recipeOf(item)).map((m) => m.id);
  return MACH_KEYS.filter((k) => ids.includes(MACH_ENTITY[k]));
}

export function defaultMach(item: string, s: { asm: AsmSpeed; furn: FurnaceKey }): MachineKey {
  const id = machineFor(recipeOf(item), s, new Set()).id;
  const key = MACH_KEYS.find((k) => MACH_ENTITY[k] === id);
  if (!key) throw new Error(`No machine key for "${id}"`);
  return key;
}

export function newLayout(id: string, name: string): PlacedLayout {
  return { id, name, nodes: [], edges: [], view: { x: 40, y: 40, z: 1 }, needsFit: true };
}

export interface CalcSource {
  plan: Pick<Plan, "build" | "inputs">;
  item: string;
  asm: AsmSpeed;
  furn: FurnaceKey;
  belt: string;
}

export function layoutFromCalc(src: CalcSource, name: string, uid: () => string): PlacedLayout {
  const { build, inputs } = src.plan;
  const L = newLayout(uid(), name);
  const depth = new Map(build.map((b) => [b.id, b.depth]));
  for (const id of inputs.keys()) {
    let d = 0;
    for (const b of build) {
      if (recipeOf(b.id).ingredients[id] !== undefined) d = Math.max(d, b.depth + 1);
    }
    depth.set(id, d);
  }
  const maxD = Math.max(0, ...depth.values());
  const colY: Record<number, number> = {};
  const idOf: Record<string, string> = {};
  const estH = (n: ModuleNode): number =>
    n.kind === "machine"
      ? 110 + 21 * Object.keys(recipeOf(n.item).ingredients).length
      : n.kind === "source"
        ? 96
        : 92;
  const place = (n: ModuleNode, d: number): void => {
    const col = maxD - d;
    const y = colY[col] ?? 0;
    L.nodes.push({ ...n, x: 24 + col * 312, y: 24 + y });
    colY[col] = y + estH(n) + 40;
  };
  const d = (id: string): number => depth.get(id) ?? 0;
  [...inputs.entries()]
    .sort((a, b) => d(b[0]) - d(a[0]))
    .forEach(([id, v]) => {
      const n: SourceNode = { id: uid(), kind: "source", item: id, rate: v.rate };
      idOf[id] = n.id;
      place(n, d(id));
    });
  [...build]
    .sort((a, b) => b.depth - a.depth)
    .forEach((b) => {
      const n: MachineNode = {
        id: uid(),
        kind: "machine",
        item: b.id,
        count: b.count,
        mach: defaultMach(b.id, src),
      };
      idOf[b.id] = n.id;
      place(n, b.depth);
    });
  const out: OutputNode = { id: uid(), kind: "output", item: null };
  place(out, -1);
  for (const b of build) {
    for (const ing of Object.keys(recipeOf(b.id).ingredients)) {
      const from = idOf[ing];
      const to = idOf[b.id];
      if (from && to) L.edges.push({ id: uid(), from, to, belt: src.belt });
    }
  }
  const final = idOf[src.item];
  if (final) L.edges.push({ id: uid(), from: final, to: out.id, belt: src.belt });
  return L;
}

/** Copy of a layout with fresh ids; edges to missing nodes are dropped. */
export function duplicateLayout(src: PlacedLayout, uid: () => string): PlacedLayout {
  const map = new Map<string, string>();
  const L = newLayout(uid(), `${src.name} (copy)`);
  L.nodes = src.nodes.map((n) => {
    const id = uid();
    map.set(n.id, id);
    return { ...n, id };
  });
  L.edges = src.edges.flatMap((e): ModuleEdge[] => {
    const from = map.get(e.from);
    const to = map.get(e.to);
    return from && to ? [{ ...e, id: uid(), from, to }] : [];
  });
  L.view = { ...src.view };
  delete L.needsFit;
  return L;
}

/** Whether a belt from `from` to `to` may be added: not to itself, not into a source, not twice. */
export function canConnect(L: PlacedLayout, from: string, to: string): boolean {
  const target = L.nodes.find((n) => n.id === to);
  return (
    !!target &&
    to !== from &&
    target.kind !== "source" &&
    !L.edges.some((e) => e.from === from && e.to === to)
  );
}

export function removeNode(L: PlacedLayout, id: string): void {
  L.nodes = L.nodes.filter((n) => n.id !== id);
  L.edges = L.edges.filter((e) => e.from !== id && e.to !== id);
}

export function removeEdge(L: PlacedLayout, id: string): void {
  L.edges = L.edges.filter((e) => e.id !== id);
}
