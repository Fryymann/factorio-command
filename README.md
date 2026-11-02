# Factorio Chain Planner

A planner for Factorio 2.1 production chains, with three parts:

- **Calculator.** Pick an item and a target (a building count or a rate). It works out every
  intermediate, how many buildings each needs, and the raw inputs. You can mark items as
  imported to cut the chain there.
- **Modules.** A node graph of production blocks. Wire sources, machines and outputs together,
  and a flow simulation shows where things are starved or over capacity.
- **Blueprint.** Turns a module or a whole chain into a tile layout with belts, inserters and
  poles, lets you edit it, and exports a blueprint string you can paste into the game.

It targets **Factorio 2.1, base game**. The data model is meant to grow to Space Age later.

## Status

To use the planner, build it and open `dist/index.html` in a browser. It is one self-contained
file, so you can copy it anywhere:

```sh
npm install
npm run build
```

It started as a single HTML file, kept in [`artifacts/`](artifacts/) as frozen history. The port
to Vite + TypeScript is finished; [`docs/migration.md`](docs/migration.md) records how it was
done.

## Getting started

Needs Node 24 or newer (`.nvmrc` is provided).

```sh
npm install
npm run dev      # local dev server
npm test         # unit tests (Vitest)
npm run check    # typecheck + format check + tests; run before opening a PR
npm run build    # builds dist/index.html, one self-contained file
```

## Layout

```
artifacts/   frozen single-file versions (history; scripts/artifact-goldens.mjs runs their code)
data/        generated game data (JSON, committed); data/raw/ holds the dump and is gitignored
docs/        design notes and the migration plan
scripts/     tooling, e.g. extract-data.ts (game dump → data/)
src/
  data/      types and loading for game data
  solver/    calculator math
  modules/   module graph and flow simulation
  blueprint/ tile layout, blueprint export and string encoding
  editor/    blueprint editor logic and belt-lane simulation
  ui/        everything that touches the DOM
```

Everything outside `src/ui/` is plain logic with no DOM access, so it can be tested.

## Game data

Recipes, machines and belts come from Factorio's own data, not typed in by hand:

```sh
npm run dump-data      # runs Factorio (base mod only) and writes the dump to data/raw/
npm run extract-data   # turns it into data/game-data.json
```

`dump-data` uses its own settings and mod folder under `data/raw/`, so it works while the game is
open and doesn't touch your saves or mods. It finds the Steam install on Windows and Linux; set
`FACTORIO` to the path of the executable if yours is elsewhere.

On NixOS the Steam build can't run directly: its launcher script expects `/bin/bash`, and the game
needs `steam-run`. Point `FACTORIO` at a small wrapper instead, and keep the checkout under your
home folder, because `steam-run` can't see private `/tmp` directories. Save this as
`factorio-nix` and make it executable (`chmod +x factorio-nix`):

```sh
#!/usr/bin/env bash
exec steam-run ~/.local/share/Steam/steamapps/common/Factorio/bin/x64_/factorio "$@"
```

```sh
FACTORIO=/path/to/factorio-nix npm run dump-data
```

`data/game-data.json` is committed, records the game version it came from, and is never edited
by hand. The app runs on it; only inserter throughput is still hand-written, in
`src/data/legacy.ts`.

## Working together

- Branch from `main` as `<name>/<topic>`, e.g. `ian/solver-tests`.
- Open a PR. The other person reviews it and it is squash-merged. Nobody pushes to `main`.
- Keep PRs to one concern. Say in the description what you tested and how.
- Coding agents follow [`AGENTS.md`](AGENTS.md). Claude Code reads it through
  [`CLAUDE.md`](CLAUDE.md).

## Contributors

- Ian ([Fryymann](https://github.com/Fryymann))
- Kaleb ([KalebMarquez](https://github.com/KalebMarquez)): wrote the original tile-layout generator (`planLayout`) that the Blueprint tab
  is built on.
