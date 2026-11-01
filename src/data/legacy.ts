// Inserter throughput, ported from artifacts/FCP_v1-2.html. The game doesn't store it directly
// (it would have to be derived from rotation speed), so it stays hand-written. Everything else the
// planner needs comes from src/data/game.ts.

export interface InserterType {
  name: string;
  ent: string;
  cap: number; // items/s
}

export const INSERTERS: Record<"basic" | "fast" | "bulk", InserterType> = {
  basic: { name: "Inserter", ent: "inserter", cap: 0.83 },
  fast: { name: "Fast inserter", ent: "fast-inserter", cap: 2.31 },
  bulk: { name: "Bulk inserter", ent: "bulk-inserter", cap: 4.6 },
};
export const LONG: InserterType = {
  name: "Long-handed inserter",
  ent: "long-handed-inserter",
  cap: 1.15,
};

/** Inserter kinds the editor can place, keyed by `EdEnt.kind`. */
export const INS_KINDS: Record<"basic" | "fast" | "bulk" | "long", InserterType> = {
  ...INSERTERS,
  long: LONG,
};
