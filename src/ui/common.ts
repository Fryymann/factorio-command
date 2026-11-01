// Helpers shared by the tab views: DOM lookup, escaping, item swatches and item pickers.
import { itemName } from "../data/game.ts";
import { ITEM_CLASS } from "../data/legacy.ts";
import type { ItemClass } from "../data/legacy.ts";

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

export const SWATCH: Record<ItemClass, string> = {
  raw: "--sw-raw",
  plate: "--sw-plate",
  mid: "--sw-mid",
  part: "--sw-part",
  red: "--sw-red",
  green: "--sw-green",
  mil: "--sw-mil",
  blue: "--sw-blue",
  purple: "--sw-purple",
  yellow: "--sw-yellow",
  fluid: "--sw-fluid",
};

export const swatchVar = (id: string | null): string =>
  `var(${SWATCH[(id && ITEM_CLASS[id]) || "raw"]})`;

export const sw = (id: string | null): string =>
  `<span class="sw" style="background:${swatchVar(id)}"></span>`;

export const PICKABLE = [
  "automation-science-pack",
  "logistic-science-pack",
  "military-science-pack",
  "chemical-science-pack",
  "production-science-pack",
  "utility-science-pack",
  "iron-gear-wheel",
  "copper-cable",
  "electronic-circuit",
  "advanced-circuit",
  "processing-unit",
  "plastic-bar",
  "sulfur",
  "sulfuric-acid",
  "lubricant",
  "engine-unit",
  "electric-engine-unit",
  "battery",
  "flying-robot-frame",
  "low-density-structure",
  "inserter",
  "transport-belt",
  "firearm-magazine",
  "piercing-rounds-magazine",
  "grenade",
  "stone-wall",
  "rail",
  "electric-furnace",
  "productivity-module",
  "pipe",
  "iron-stick",
  "iron-plate",
  "copper-plate",
  "stone-brick",
  "steel-plate",
];

export const GROUPS: [string, (id: string) => boolean][] = [
  ["Science packs", (c) => /science/.test(c)],
  ["Intermediates", (c) => !/science|plate|brick/.test(c)],
  ["Plates", (c) => /plate|brick/.test(c)],
];

export const itemOptions = (ids: string[], selId?: string | null): string =>
  ids
    .map(
      (id) =>
        `<option value="${id}"${id === selId ? " selected" : ""}>${esc(itemName(id))}</option>`,
    )
    .join("");

/** `<optgroup>`s of the pickable items, by group. */
export const groupedOptions = (): string =>
  GROUPS.map(
    ([g, f]) => `<optgroup label="${g}">${itemOptions(PICKABLE.filter(f))}</optgroup>`,
  ).join("");
