// Saved data from before the switch to game data used the artifact's short keys for machines,
// furnaces and belts. These map each one to the game's entity name. Each function passes a known
// entity name through unchanged and returns null for anything it doesn't recognise, so callers
// can warn instead of guessing.
import type { AssemblerId, FurnaceId } from "../solver/solve.ts";
import { BELTS, GAME, own } from "./game.ts";

const ASM: Record<string, AssemblerId> = {
  "0.5": "assembling-machine-1",
  "0.75": "assembling-machine-2",
  "1.25": "assembling-machine-3",
};
const FURN: Record<string, FurnaceId> = {
  stone: "stone-furnace",
  steel: "steel-furnace",
  electric: "electric-furnace",
};
const MACH: Record<string, string> = {
  am1: "assembling-machine-1",
  am2: "assembling-machine-2",
  am3: "assembling-machine-3",
  stone: "stone-furnace",
  steel: "steel-furnace",
  electric: "electric-furnace",
  chem: "chemical-plant",
};
const BELT: Record<string, string> = {
  "15": "transport-belt",
  "30": "fast-transport-belt",
  "45": "express-transport-belt",
  "60": "turbo-transport-belt",
};

const ASSEMBLERS = new Set<string>(Object.values(ASM));
const FURNACES = new Set<string>(Object.values(FURN));

export function migrateAsm(v: unknown): AssemblerId | null {
  if (typeof v !== "string") return null;
  if (ASSEMBLERS.has(v)) return v as AssemblerId;
  return own(ASM, v) ?? null;
}

export function migrateFurn(v: unknown): FurnaceId | null {
  if (typeof v !== "string") return null;
  if (FURNACES.has(v)) return v as FurnaceId;
  return own(FURN, v) ?? null;
}

/** A Modules block's machine: any crafting machine in the game data. */
export function migrateMach(v: unknown): string | null {
  if (typeof v !== "string") return null;
  if (own(GAME.machines, v)) return v;
  return own(MACH, v) ?? null;
}

/** A belt tier. The artifact sometimes saved the rate as a number. */
export function migrateBelt(v: unknown): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const k = String(v);
  if (own(BELTS, k)) return k;
  return own(BELT, k) ?? null;
}
