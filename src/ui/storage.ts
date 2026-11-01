// Calculator state in localStorage (`fcp-state`). The only place the calculator touches the
// browser's storage. Ported from artifacts/FCP_v1-2.html, lines 496-498.
import type { AsmSpeed, FurnaceKey, PlanSettings, TargetMode } from "../solver/solve.ts";

export const STATE_KEY = "fcp-state";

const KEPT = "They're left as they are until you change a setting.";
const LOAD_ERROR = `Saved calculator settings couldn't be read, so defaults are shown. ${KEPT}`;

/**
 * What the calculator form holds, saved as-is. `amount` is what the player typed, and in "rate"
 * mode it is per minute; `planSettings` (planInput.ts) turns it into solver input.
 */
export interface CalcState extends Omit<PlanSettings, "amount"> {
  amount: number | string;
  belt: string;
  unit: "60" | "1";
}

export const DEFAULT_STATE: CalcState = {
  item: "logistic-science-pack",
  amount: 8,
  mode: "buildings",
  asm: "0.75",
  furn: "steel",
  belt: "15",
  unit: "60",
  imports: [],
};

const ASMS: AsmSpeed[] = ["0.5", "0.75", "1.25"];
const FURNS: FurnaceKey[] = ["stone", "steel", "electric"];
const MODES: TargetMode[] = ["buildings", "rate"];

/** Keeps every field of `saved` that has a valid value; anything else falls back to the default. */
export function parseState(raw: string | null): { state: CalcState; error?: string } {
  const state: CalcState = { ...DEFAULT_STATE, imports: [] };
  if (raw === null) return { state };
  let d: unknown;
  try {
    d = JSON.parse(raw);
  } catch {
    return { state, error: LOAD_ERROR };
  }
  if (!d || typeof d !== "object") return { state };
  const o = d as Record<string, unknown>;
  if (typeof o.item === "string") state.item = o.item;
  if (typeof o.amount === "number" || typeof o.amount === "string") state.amount = o.amount;
  if (MODES.includes(o.mode as TargetMode)) state.mode = o.mode as TargetMode;
  if (ASMS.includes(o.asm as AsmSpeed)) state.asm = o.asm as AsmSpeed;
  if (FURNS.includes(o.furn as FurnaceKey)) state.furn = o.furn as FurnaceKey;
  if (typeof o.belt === "string") state.belt = o.belt;
  if (o.unit === "60" || o.unit === "1") state.unit = o.unit;
  if (Array.isArray(o.imports)) state.imports = o.imports.filter((x) => typeof x === "string");
  return { state };
}

export function loadState(): { state: CalcState; error?: string } {
  try {
    return parseState(localStorage.getItem(STATE_KEY));
  } catch (e) {
    return {
      state: parseState(null).state,
      error: `Couldn't read saved settings: ${String(e)}. ${KEPT}`,
    };
  }
}

/** Returns an error message if the save failed, so the UI can show it. */
export function saveState(state: CalcState): string | undefined {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch (e) {
    return `Couldn't save calculator settings: ${String(e)}`;
  }
  return undefined;
}

/**
 * When the calculator writes `fcp-state` (#15). Nothing is written until the user changes a
 * setting, so saved data that failed to load isn't replaced by the defaults on the first render.
 * The load error stays visible until a save has replaced that data.
 */
export function createStateSaver(
  save: (state: CalcState) => string | undefined,
  loadError?: string,
): { changed(state: CalcState): void; warnings(): string[] } {
  let pendingLoadError = loadError;
  let saveError: string | undefined;
  return {
    changed(state) {
      saveError = save(state);
      if (!saveError) pendingLoadError = undefined;
    },
    warnings() {
      return [pendingLoadError, saveError].filter((w): w is string => w !== undefined);
    },
  };
}
