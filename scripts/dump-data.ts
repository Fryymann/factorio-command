// Runs Factorio to dump its base-game data and English names into data/raw/ (gitignored), ready
// for `npm run extract-data`.
//
//   npm run dump-data
//
// Uses its own config and mod folder under data/raw/factorio/, so it works while the game is open
// and never touches your saves, settings or mods. Only the base mod is enabled.
// Set FACTORIO to the path of factorio.exe (or bin/x64/factorio on Linux) if it isn't the default
// Steam install on Windows.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseLoadedMods } from "./extract.ts";

const exe =
  process.env.FACTORIO ??
  "C:/Program Files (x86)/Steam/steamapps/common/Factorio/bin/x64/factorio.exe";
if (!existsSync(exe)) {
  console.error(
    `Factorio not found at ${exe}. Set FACTORIO to the path of the factorio executable.`,
  );
  process.exit(1);
}

const raw = resolve(import.meta.dirname, "../data/raw");
const work = join(raw, "factorio");
const mods = join(work, "mods");
mkdirSync(mods, { recursive: true });

writeFileSync(
  join(work, "config.ini"),
  `[path]\nread-data=__PATH__executable__/../../data\nwrite-data=${work.replaceAll("\\", "/")}\n`,
);
// The expansion's mods ship with the game; list them as disabled so only base loads.
const dlc = ["elevated-rails", "quality", "recycler", "space-age"];
writeFileSync(
  join(mods, "mod-list.json"),
  JSON.stringify({
    mods: [{ name: "base", enabled: true }, ...dlc.map((name) => ({ name, enabled: false }))],
  }),
);

function run(flag: string): string {
  const args = ["--config", join(work, "config.ini"), "--mod-directory", mods, flag];
  const r = spawnSync(exe, args, { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`factorio ${flag} failed (exit ${r.status})`);
  return readFileSync(join(work, "factorio-current.log"), "utf8");
}

const loaded = parseLoadedMods(run("--dump-data"));
if (loaded.length !== 1 || loaded[0]!.name !== "base") {
  throw new Error(`expected only the base mod, but Factorio loaded: ${JSON.stringify(loaded)}`);
}
run("--dump-prototype-locale");

const out = join(work, "script-output");
const files = [
  "data-raw-dump.json",
  ...["item", "fluid", "entity", "recipe"].map((k) => `${k}-locale.json`),
];
for (const f of files) copyFileSync(join(out, f), join(raw, f));
writeFileSync(join(raw, "mods.json"), JSON.stringify(loaded, null, 2) + "\n");
console.log(
  `Factorio ${loaded[0]!.version}, base only. Wrote ${files.join(", ")} and mods.json to data/raw/.`,
);
