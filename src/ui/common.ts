// Helpers shared by the tab views: DOM lookup, escaping, item swatches and item pickers.
import {
  GAME,
  ITEMS_IN_ORDER,
  PLANNABLE,
  itemName,
  machine,
  own,
  plannedRecipe,
  unsupported,
} from "../data/game.ts";

export const el = <T extends HTMLElement>(id: string): T => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Missing #${id} in index.html`);
  return e as T;
};

const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
export const esc = (s: unknown): string => String(s).replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);

// Short labels for machine boxes and pickers; the game has no short names.
const MACHINE_SHORT: Record<string, string> = {
  "assembling-machine-1": "AM1",
  "assembling-machine-2": "AM2",
  "assembling-machine-3": "AM3",
  "stone-furnace": "Stone furnace",
  "steel-furnace": "Steel furnace",
  "electric-furnace": "Electric furnace",
  "chemical-plant": "Chem plant",
};
/** A machine's short label, or its game name when it has none. */
export const machineShort = (id: string): string => own(MACHINE_SHORT, id) ?? machine(id).name;

// Swatch colour by the item's crafting-menu group (Ian, #26). Raw inputs and fluids keep their
// own colours. A UI choice, not game data.
const GROUP_SWATCH: Record<string, string> = {
  logistics: "--sw-yellow",
  production: "--sw-mid",
  "intermediate-products": "--sw-plate",
  combat: "--sw-red",
  fluids: "--sw-fluid",
};

export const swatchVar = (id: string | null): string => {
  const it = id ? own(GAME.items, id) : undefined;
  let v = "--sw-raw";
  if (it?.fluid) v = "--sw-fluid";
  else if (it && (plannedRecipe(it.id) || unsupported(it.id))) {
    v = own(GROUP_SWATCH, it.group) ?? "--sw-part";
  }
  return `var(${v})`;
};

export const sw = (id: string | null): string =>
  `<span class="sw" style="background:${swatchVar(id)}"></span>`;

export const itemOptions = (ids: readonly string[], selId?: string | null): string =>
  ids
    .map(
      (id) =>
        `<option value="${id}"${id === selId ? " selected" : ""}>${esc(itemName(id))}</option>`,
    )
    .join("");

/** `<optgroup>`s of `ids` by the game's crafting-menu group, in the game's order. */
export function groupedOptions(ids: readonly string[] = PLANNABLE, selId?: string | null): string {
  const byGroup = new Map<string, string[]>();
  for (const id of ids) {
    const g = GAME.items[id]!.group;
    byGroup.set(g, [...(byGroup.get(g) ?? []), id]);
  }
  return [...byGroup]
    .sort(([a], [b]) => (GAME.groups[a]!.order < GAME.groups[b]!.order ? -1 : 1))
    .map(
      ([g, list]) =>
        `<optgroup label="${esc(GAME.groups[g]!.name)}">${itemOptions(list, selId)}</optgroup>`,
    )
    .join("");
}

/** Items the planner can't make yet, listed but disabled, each with its reason as a tooltip. */
export const unsupportedOptions = (): string => {
  const ids = ITEMS_IN_ORDER.filter((id) => unsupported(id));
  return `<optgroup label="Not supported yet">${ids
    .map(
      (id) =>
        `<option value="${id}" disabled title="${esc(unsupported(id))}">${esc(itemName(id))}</option>`,
    )
    .join("")}</optgroup>`;
};

/** Raw inputs: items the planner never makes (ores, water, oil products, ...), not fluids first. */
export const RAW_ITEMS: readonly string[] = ITEMS_IN_ORDER.filter(
  (id) => !plannedRecipe(id) && !unsupported(id),
);
