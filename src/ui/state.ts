// Calculator settings shared by every tab (the artifact's global `state`). Loaded once from
// `fcp-state`. Rates stay per second everywhere except `rateStr`, which converts for display.
import { fmt } from "../data/format.ts";
import { loadState } from "./storage.ts";
import type { CalcState } from "./storage.ts";

const loaded = loadState();
export const state: CalcState = loaded.state;
export const stateLoadError: string | undefined = loaded.error;

export const rateStr = (r: number): string =>
  fmt(r * Number(state.unit), state.unit === "1" ? 2 : 1);
export const unitLbl = (): string => (state.unit === "60" ? "/min" : "/s");
