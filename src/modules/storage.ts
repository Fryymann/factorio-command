// Saved layouts (`localStorage` key `fcp-layouts`). Pure over a minimal key-value interface so
// the browser's `localStorage` is only touched in src/ui. Ported from `plLoad`/`plSave`
// (artifacts/FCP_v1-2.html, lines 683-699), with three changes the rules require:
//   * a failed save is reported, not swallowed (the artifact lost edits silently);
//   * unreadable data is reported, never replaced by an empty state;
//   * `chainEdit` is stored in compact form and read back from either form.
import { decodeEnts, encodeEnts } from "../editor/compact.ts";
import type { ChainBasis, ChainEdit } from "../editor/chainEdit.ts";
import type { Tuple } from "../editor/compact.ts";
import type { EditDoc } from "../editor/types.ts";
import type { BpSettings } from "../blueprint/fromModules.ts";
import { migrateLayouts } from "./migrate.ts";
import type { ModuleGraph } from "./types.ts";

export const LAYOUTS_KEY = "fcp-layouts";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** One saved layout. `edits` is per module node id; `chainEdit` is the whole-chain edit. */
export interface SavedLayout extends ModuleGraph {
  id: string;
  bp?: Partial<BpSettings>;
  edits?: Record<string, EditDoc>;
  chainEdit?: ChainEdit;
  [extra: string]: unknown; // view, needsFit, ... owned by the UI
}

export interface LayoutsState {
  layouts: Record<string, SavedLayout>;
  order: string[];
  current: string | null;
}

/** On disk, a chain edit's entities are tuples. */
interface StoredChainEdit {
  v: 2;
  ents: Tuple[];
  basis: ChainBasis;
}

export type LoadResult =
  | { ok: true; state: LayoutsState | null } // null: nothing saved yet
  | { ok: false; error: string };

export function loadLayouts(kv: KeyValueStore): LoadResult {
  let raw: string | null;
  try {
    raw = kv.getItem(LAYOUTS_KEY);
  } catch (e) {
    return { ok: false, error: `Couldn't read saved layouts: ${String(e)}` };
  }
  if (raw === null) return { ok: true, state: null };
  let d: unknown;
  try {
    d = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Saved layouts are not valid JSON. They were left untouched." };
  }
  if (
    !d ||
    typeof d !== "object" ||
    !("layouts" in d) ||
    !d.layouts ||
    typeof d.layouts !== "object"
  )
    return {
      ok: false,
      error: "Saved layouts have an unexpected shape. They were left untouched.",
    };
  const src = d as {
    version?: unknown;
    layouts: Record<string, SavedLayout>;
    order?: string[];
    current?: string | null;
  };
  if (src.version !== undefined && src.version !== 2)
    return {
      ok: false,
      error: "Saved layouts are from a newer version of the planner. They were left untouched.",
    };
  try {
    // Version 2 names machines and belts by entity name; before that, by the artifact's keys.
    const stored = src.version === 2 ? src.layouts : migrateLayouts(src.layouts);
    const layouts: Record<string, SavedLayout> = {};
    for (const [id, L] of Object.entries(stored)) layouts[id] = readLayout(L);
    const order = (src.order ?? Object.keys(layouts)).filter((id) => layouts[id]);
    return { ok: true, state: { layouts, order, current: src.current ?? null } };
  } catch (e) {
    return { ok: false, error: `${(e as Error).message} Saved layouts were left untouched.` };
  }
}

function readLayout(L: SavedLayout): SavedLayout {
  const raw = (L as { chainEdit?: unknown }).chainEdit as
    { ents?: unknown; basis?: ChainBasis } | undefined;
  if (raw === undefined) return L;
  if (!raw.basis || typeof raw.basis !== "object")
    throw new Error(`The chain edit in "${L.name}" has no basis.`);
  return { ...L, chainEdit: { ents: decodeEnts(raw.ents), basis: raw.basis } };
}

export type SaveResult =
  { ok: true; bytes: number } | { ok: false; reason: "quota" | "error"; message: string };

const isQuota = (e: unknown) =>
  e instanceof Error &&
  (e.name === "QuotaExceededError" ||
    e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    (e as { code?: number }).code === 22);

export function saveLayouts(kv: KeyValueStore, state: LayoutsState): SaveResult {
  const layouts: Record<string, unknown> = {};
  for (const [id, L] of Object.entries(state.layouts)) {
    if (!L.chainEdit) {
      layouts[id] = L;
      continue;
    }
    const stored: StoredChainEdit = {
      v: 2,
      ents: encodeEnts(L.chainEdit.ents),
      basis: L.chainEdit.basis,
    };
    layouts[id] = { ...L, chainEdit: stored };
  }
  const json = JSON.stringify({
    version: 2,
    layouts,
    order: state.order,
    current: state.current,
  });
  try {
    kv.setItem(LAYOUTS_KEY, json);
  } catch (e) {
    return isQuota(e)
      ? {
          ok: false,
          reason: "quota",
          message:
            "Browser storage is full, so your latest edits were NOT saved. Copy the blueprint string now, or discard another layout.",
        }
      : { ok: false, reason: "error", message: `Couldn't save layouts: ${String(e)}` };
  }
  return { ok: true, bytes: json.length };
}
