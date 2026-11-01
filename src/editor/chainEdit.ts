// Whole-chain editing: the saved edit, the snapshot it was generated from, and the warnings
// shown when the module graph has changed since. See docs/chain-edit-plan.md sections 1-3.
// A chain edit is never regenerated quietly; the only ways out are editing on or discarding.
import type { BpSettings, Solution } from "../blueprint/fromModules.ts";
import type { Layout } from "../blueprint/layout.ts";
import { BELT_TIERS, INSERTERS, MACH, short } from "../data/legacy.ts";
import type { MachineKey } from "../data/legacy.ts";
import { edFromLayout } from "./fromLayout.ts";
import type { EdEnt } from "./types.ts";

/** What the chain looked like when the edit was started. */
export interface ChainBasis {
  belt: string;
  ins: string;
  maxRow: number;
  machines: Record<string, { count: number; mach: MachineKey }>;
}

export interface ChainEdit {
  ents: EdEnt[];
  basis: ChainBasis;
}

export function makeBasis(sol: Pick<Solution, "build">, bp: BpSettings): ChainBasis {
  const machines: ChainBasis["machines"] = {};
  for (const b of sol.build) machines[b.id] = { count: b.count, mach: b.mach };
  return { belt: bp.belt, ins: bp.ins, maxRow: bp.maxRow, machines };
}

/** Starts a chain edit from the generated layout ("Edit" on the whole chain). */
export function startChainEdit(
  LY: Layout,
  sol: Pick<Solution, "build">,
  bp: BpSettings,
): ChainEdit {
  return { ents: edFromLayout(LY, bp).ents, basis: makeBasis(sol, bp) };
}

export type StaleKind = "count" | "added" | "removed" | "machine" | "belt" | "inserter" | "maxRow";

export interface StaleWarning {
  kind: StaleKind;
  item?: string;
  text: string;
}

const beltName = (k: string) => BELT_TIERS[k]?.name ?? k;
const insName = (k: string) => (INSERTERS as Record<string, { name: string }>)[k]?.name ?? k;

/**
 * Differences between the snapshot and the chain as it is now. Empty means the edit still
 * matches. The UI offers "Discard edits" next to each warning.
 */
export function staleWarnings(
  basis: ChainBasis,
  sol: Pick<Solution, "build">,
  bp: BpSettings,
): StaleWarning[] {
  const out: StaleWarning[] = [];
  const now = makeBasis(sol, bp).machines;
  const ids = [...new Set([...Object.keys(basis.machines), ...Object.keys(now)])].sort();
  for (const id of ids) {
    const was = basis.machines[id];
    const is = now[id];
    const nm = short(id);
    if (was && !is)
      out.push({ kind: "removed", item: id, text: `${nm} was removed from the chain.` });
    else if (!was && is)
      out.push({
        kind: "added",
        item: id,
        text: `${nm} was added to the chain (${is.count} machines).`,
      });
    else if (was && is) {
      if (was.count !== is.count)
        out.push({
          kind: "count",
          item: id,
          text: `${nm} machine count changed from ${was.count} to ${is.count}.`,
        });
      if (was.mach !== is.mach)
        out.push({
          kind: "machine",
          item: id,
          text: `${nm} is now made in ${MACH[is.mach].name} instead of ${MACH[was.mach].name}.`,
        });
    }
  }
  if (basis.belt !== bp.belt)
    out.push({
      kind: "belt",
      text: `Belt tier changed from ${beltName(basis.belt)} to ${beltName(bp.belt)}. Underground reach is different.`,
    });
  if (basis.ins !== bp.ins)
    out.push({
      kind: "inserter",
      text: `Inserter type changed from ${insName(basis.ins)} to ${insName(bp.ins)}.`,
    });
  if (basis.maxRow !== bp.maxRow)
    out.push({
      kind: "maxRow",
      text: `Maximum row length changed from ${basis.maxRow} to ${bp.maxRow}.`,
    });
  return out;
}
