// Runs Factorio to dump its base-game data and English names into data/raw/ (gitignored), ready
// for `npm run extract-data`.
//
//   npm run dump-data
//
// Uses its own config and mod folder under data/raw/factorio/, so it works while the game is open
// and never touches your saves, settings or mods. Only the base mod is enabled.
// Finds the Steam install on Windows and Linux. Otherwise, or on NixOS, set FACTORIO to the
// executable (or a wrapper script; see README, "Game data").
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseLoadedMods } from "./extract.ts";
import { factorioCandidates, spawnFailure } from "./factorio.ts";

const candidates = factorioCandidates(process.platform, homedir(), process.env);
const found = candidates.find((p) => existsSync(p));
if (!found) {
  const looked = candidates.length ? `Looked in:\n  ${candidates.join("\n  ")}\n` : "";
  console.error(
    `Factorio not found. ${looked}Set FACTORIO to the path of the factorio executable ` +
      `(on NixOS, a wrapper that runs it through steam-run; see README).`,
  );
  process.exit(1);
}
const exe = found;

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
  const failure = spawnFailure(flag, spawnSync(exe, args, { stdio: "inherit" }), existsSync(exe));
  if (failure) throw new Error(failure);
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
