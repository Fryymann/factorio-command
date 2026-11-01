# Factorio Chain Planner

A planner for Factorio 2.0 production chains, with three parts:

- **Calculator.** Pick an item and a target (a building count or a rate). It works out every
  intermediate, how many buildings each needs, and the raw inputs. You can mark items as
  imported to cut the chain there.
- **Modules.** A node graph of production blocks. Wire sources, machines and outputs together,
  and a flow simulation shows where things are starved or over capacity.
- **Blueprint.** Turns a module or a whole chain into a tile layout with belts, inserters and
  poles, lets you edit it, and exports a blueprint string you can paste into the game.

It targets **Factorio 2.0, base game**. The data model is meant to grow to Space Age later.

## Status

The planner works, but right now it lives in a single HTML file:
[`artifacts/FCP_v1-2.html`](artifacts/FCP_v1-2.html). Open it in a browser to use it.

We are moving it into a Vite + TypeScript project so two people (and their agents) can work
on it without colliding. Progress and the line-by-line source map are in
[`docs/migration.md`](docs/migration.md).

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
artifacts/   frozen single-file versions (reference only, do not edit)
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
open and doesn't touch your saves or mods. It looks for the Steam install on Windows; set
`FACTORIO` to the path of the executable if yours is elsewhere. `data/game-data.json` is
committed, records the game version it came from, and is never edited by hand. The app still
runs on the hand-typed tables in `src/data/legacy.ts` until they're switched over.

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
