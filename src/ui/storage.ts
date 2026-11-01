// Calculator state in localStorage (`fcp-state`). The only place the calculator touches the
// browser's storage. Ported from artifacts/FCP_v1-2.html, lines 496-498.
import { plannedRecipe } from "../data/game.ts";
import { migrateAsm, migrateBelt, migrateFurn } from "../data/savedKeys.ts";
import type { PlanSettings, TargetMode } from "../solver/solve.ts";

export const STATE_KEY = "fcp-state";

const KEPT = "They're left as they are until you change a setting.";
const LOAD_ERROR = `Saved calculator settings couldn't be read, so defaults are shown. ${KEPT}`;

/**
 * What the calculator form holds, saved as-is. `amount` is what the player typed, and in "rate"
 * mode it is per minute; `planSettings` (planInput.ts) turns it into solver input.
 */
export interface CalcState extends Omit<PlanSettings, "amount"> {
  /** Shape of the saved data. 2: machines and belts by entity name. Absent: the artifact's keys. */
  version: 2;
  amount: number | string;
  belt: string; // belt entity name
  unit: "60" | "1";
}

export const DEFAULT_STATE: CalcState = {
  version: 2,
  item: "logistic-science-pack",
  amount: 8,
  mode: "buildings",
  asm: "assembling-machine-2",
  furn: "steel-furnace",
  belt: "transport-belt",
  unit: "60",
  imports: [],
};

const MODES: TargetMode[] = ["buildings", "rate"];

/**
 * Keeps every field of `saved` that has a valid value. An unknown product, machine or belt falls
 * back to the default with a warning naming it; the artifact's keys ("0.75", "steel", "15") are
 * mapped to entity names. Other fields that don't fit fall back silently, as before.
 */
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
  if (o.version !== undefined && o.version !== 2) {
    return {
      state,
      error: `Saved calculator settings are from a newer version of the planner, so defaults are shown. ${KEPT}`,
    };
  }
  const unknown: string[] = [];
  const pick = <T>(
    what: string,
    v: unknown,
    read: (v: unknown) => T | null,
    set: (x: T) => void,
  ) => {
    if (v === undefined) return;
    const x = read(v);
    if (x === null) unknown.push(`${what} ${JSON.stringify(v)}`);
    else set(x);
  };
  pick(
    "product",
    o.item,
    (v) => (typeof v === "string" && plannedRecipe(v) ? v : null),
    (x) => (state.item = x),
  );
  if (typeof o.amount === "number" || typeof o.amount === "string") state.amount = o.amount;
  if (MODES.includes(o.mode as TargetMode)) state.mode = o.mode as TargetMode;
  pick("assembler", o.asm, migrateAsm, (x) => (state.asm = x));
  pick("furnace", o.furn, migrateFurn, (x) => (state.furn = x));
  pick("belt", o.belt, migrateBelt, (x) => (state.belt = x));
  if (o.unit === "60" || o.unit === "1") state.unit = o.unit;
  if (Array.isArray(o.imports)) state.imports = o.imports.filter((x) => typeof x === "string");
  if (unknown.length === 0) return { state };
  return {
    state,
    error: `Saved calculator settings name things this version doesn't know (${unknown.join(", ")}), so defaults are used for those. ${KEPT}`,
  };
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
