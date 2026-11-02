// Turns Factorio's data dump into data/game-data.json (shape: src/data/types.ts).
//
//   npm run dump-data      # runs Factorio, writes data/raw/ (see dump-data.ts)
//   npm run extract-data   # writes data/game-data.json
//
// Commit data/game-data.json, never edit it by hand. Review its diff like any other numbers.
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { extract, type RawDump } from "./extract.ts";

const raw = resolve(import.meta.dirname, "../data/raw");
const read = (f: string): unknown => {
  try {
    return JSON.parse(readFileSync(join(raw, f), "utf8"));
  } catch (e) {
    throw new Error(`can't read data/raw/${f}; run npm run dump-data first`, { cause: e });
  }
};
const names = (kind: string) =>
  (read(`${kind}-locale.json`) as { names: Record<string, string> }).names;

const mods = read("mods.json") as { name: string; version: string }[];
const base = mods.find((m) => m.name === "base");
if (!base) throw new Error("data/raw/mods.json has no base mod");

const { data, skipped } = extract({
  dump: read("data-raw-dump.json") as RawDump,
  locale: {
    item: names("item"),
    fluid: names("fluid"),
    entity: names("entity"),
    recipe: names("recipe"),
    itemGroup: names("item-group"),
  },
  factorioVersion: base.version,
  mods: mods.map((m) => m.name),
});

const out = resolve(import.meta.dirname, "../data/game-data.json");
writeFileSync(out, JSON.stringify(data, null, 2) + "\n");
console.log(
  `Factorio ${data.factorioVersion} (${data.mods.join(", ")}): ` +
    `${Object.keys(data.recipes).length} recipes, ${Object.keys(data.items).length} items, ` +
    `${Object.keys(data.machines).length} machines, ${Object.keys(data.belts).length} belt tiers.`,
);
console.log(`Skipped ${skipped.length}:\n  ${skipped.join("\n  ")}`);
