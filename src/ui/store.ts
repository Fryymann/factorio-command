// The saved layouts (`fcp-layouts`) shared by the Modules and Blueprint tabs. Reading and writing
// goes through src/modules/storage.ts. If saved layouts can't be read, nothing is written, so they
// are never overwritten; the reason is shown on both tabs.
import { loadLayouts, saveLayouts } from "../modules/storage.ts";
import type { LayoutsState } from "../modules/storage.ts";
import type { PlacedLayout } from "../modules/fromCalc.ts";

export const data: LayoutsState = { layouts: {}, order: [], current: null };

let persistBlocked = false;
let message: string | null = null;
const listeners: ((m: string | null) => void)[] = [];

export const saveMessage = (): string | null => message;
export function onMessage(cb: (m: string | null) => void): void {
  listeners.push(cb);
  cb(message);
}
function setMessage(m: string | null): void {
  message = m;
  for (const cb of listeners) cb(m);
}

export function current(): PlacedLayout {
  const L = data.current ? data.layouts[data.current] : undefined;
  if (!L) throw new Error("No current layout");
  return L as PlacedLayout;
}

export function addLayout(L: PlacedLayout): void {
  data.layouts[L.id] = L;
  data.order.push(L.id);
  data.current = L.id;
}

export function saveNow(): void {
  if (persistBlocked) return;
  const r = saveLayouts(localStorage, data);
  setMessage(r.ok ? null : r.message);
}

let timer: ReturnType<typeof setTimeout> | undefined;
export function saveSoon(): void {
  clearTimeout(timer);
  timer = setTimeout(saveNow, 300);
}

/** Loads saved layouts once at start-up. `example` makes the first layout when none are saved. */
export function loadStore(example: () => PlacedLayout): void {
  let r: ReturnType<typeof loadLayouts>;
  try {
    r = loadLayouts(localStorage);
  } catch (e) {
    r = { ok: false, error: `Couldn't read saved layouts: ${String(e)}` };
  }
  if (!r.ok) {
    persistBlocked = true;
    setMessage(`${r.error} Changes will not be saved until that's fixed.`);
  } else if (r.state) {
    Object.assign(data, r.state);
    for (const L of Object.values(data.layouts)) {
      const P = L as PlacedLayout;
      if (!P.view) P.view = { x: 40, y: 40, z: 1 };
    }
  }
  if (!data.order.length) addLayout(example());
  if (!data.current || !data.layouts[data.current]) data.current = data.order[0] ?? null;
}
