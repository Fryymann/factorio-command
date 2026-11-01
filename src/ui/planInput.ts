// Turns the calculator form into solver input. The amount is parsed here and, in "rate" mode,
// converted from per minute (what the player types) to per second (what the solver uses), so
// src/solver never sees strings or per-minute rates (#19).
import type { PlanSettings } from "../solver/solve.ts";
import type { CalcState } from "./storage.ts";

export type PlanInput = { ok: true; settings: PlanSettings } | { ok: false; error: string };

export function planSettings(s: CalcState): PlanInput {
  const raw = typeof s.amount === "string" ? s.amount.trim() : s.amount;
  if (raw === "") return { ok: false, error: "Enter a target amount." };
  const amt = Number(raw);
  if (!Number.isFinite(amt)) {
    return { ok: false, error: `"${String(s.amount)}" isn't a number. Enter a target amount.` };
  }
  if (amt < 0) return { ok: false, error: "The target amount can't be negative." };
  const { item, mode, asm, furn, imports } = s;
  return {
    ok: true,
    settings: { item, mode, asm, furn, imports, amount: mode === "rate" ? amt / 60 : amt },
  };
}
