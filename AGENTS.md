# AGENTS.md

Guidance for coding agents (Claude Code, Codex, others) working in this repo. Two developers
share it, each with their own agent, so most of these rules are about not stepping on each
other and not shipping wrong numbers.

Read `README.md` for what the project is. Read `docs/migration.md` before touching anything
that is being ported from `artifacts/`.

## The project in one paragraph

A Factorio 2.1 (base game) production planner: a calculator, a module graph with flow
simulation, and a blueprint generator and editor. The working version is the single file
`artifacts/FCP_v1-2.html`. It is being ported into Vite + TypeScript under `src/`. The build
is still a single self-contained `dist/index.html`.

## Commands

```sh
npm run check    # typecheck + prettier check + tests. Must pass before you call work done.
npm test         # Vitest only
npm run format   # prettier --write
npm run dev      # dev server
npm run build    # dist/index.html
```

Don't report something as working unless you have run the command that shows it. If you
couldn't run it, say so.

## Layout and boundaries

| Path             | What lives there                          | Rule                                        |
| ---------------- | ----------------------------------------- | ------------------------------------------- |
| `artifacts/`     | Frozen single-file versions               | Read-only. Port from them, never edit them. |
| `data/*.json`    | Generated game data                       | Never edit by hand. Change the extractor.   |
| `scripts/`       | Tooling (data extraction)                 | Node 24 runs `.ts` directly; no build step. |
| `src/data/`      | Types and loaders for game data           | Type changes affect everyone (see below).   |
| `src/solver/`    | Calculator math                           | Pure functions. No DOM.                     |
| `src/modules/`   | Module graph and flow simulation          | Pure functions. No DOM.                     |
| `src/blueprint/` | Tile layout, export, string encoding      | Pure functions. No DOM.                     |
| `src/editor/`    | Editor logic and belt-lane simulation     | Pure functions. No DOM.                     |
| `src/ui/`        | Rendering, events, canvas, `localStorage` | The only place that touches the browser.    |

Tests sit next to the code: `foo.ts` and `foo.test.ts`.

## Correctness rules

The tool exists to give players numbers they build factories from. A wrong number that looks
right is the worst bug this project can have.

- **Internal unit is per second.** Rates are items (or fluid units) per second everywhere in
  `src/`. Converting to per minute happens in `src/ui/` only.
- **Fail loudly.** If an input is missing, unknown or out of range, return a warning or throw.
  Don't fall back to a guess that produces a plausible number.
- **Test the numbers.** Any change to the solver, simulation, layout or export comes with a test
  that checks real values. Where you can, take expected values from the game or the
  [Factorio wiki](https://wiki.factorio.com), and cite the source in the test.
- **When porting, pin behaviour first.** Write a test for what the artifact does today, then
  port, then change behaviour in a separate commit. If you think the artifact is wrong, say so
  in the PR. Don't fix it silently while porting.
- **Game data comes from the game.** Recipes, machines and speeds come from the extracted data
  dump, not from memory or the wiki. If something is missing from the data, extend the
  extractor.
- **Blueprints target 2.1.** 16-way directions (N=0, E=4, S=8, W=12), version
  `562954249961473` (2.1.24.1, read from a blueprint the game exported), and the string format in `src/blueprint/encode.ts`. Space Age entities
  (turbo belts, etc.) must sit behind a Space Age setting.
- **Saved user data survives.** `localStorage` keys `fcp-state` and `fcp-layouts` hold people's
  work. If you change the shape, write a migration and test it.

## Working alongside the other developer

- **Branches:** `<name>/<topic>` off `main`, e.g. `ian/solver-tests`. One concern per branch.
- **PRs:** every change goes through a PR, reviewed by the other human. Squash-merge. Nobody
  pushes to `main`, and agents never do.
- **Commits and pushes happen only when your human asks.** Don't open PRs, merge, force-push
  or delete branches on your own.
- **Shared types:** a change to `src/data/types.ts` or any exported type used across folders
  must be called out in the PR description, because the other branch is probably building on it.
- **Windows and Linux.** Ian works on Windows, Kaleb on NixOS. Scripts, `npm` commands and tests
  must work on both: no hard-coded paths without a way to override them, no shell-only commands,
  and tests read only committed files (never `data/raw/`).
- **Stay in scope.** Don't reformat, rename or "tidy" code your task doesn't need. Prettier
  handles formatting; run `npm run format` on files you touched.
- **Handoffs go in GitHub.** Notes for the other developer or their agent go in the PR
  description or an issue (see Agent notes below), not in files in the repo.
- **Personal agent setup stays personal.** Agent identities, memory and personal preferences
  belong in your user-level config (e.g. `~/.claude/CLAUDE.md`), not in this repo.

## Agent notes

Agents leave each other notes as GitHub issues labelled `agent-note`. An issue is assigned to
the human whose side has to act next: Ian is `Fryymann`, Kaleb is `KalebMarquez`.

- **At session start**, before other work, list the notes assigned to your human and tell them
  what is waiting and from whom:

  ```sh
  gh issue list --label agent-note --state open --assignee <your human's login>
  ```

  Read the whole thread with `gh issue view <number> --comments`, not just the title.

- **Sign what you write.** Agents post through their human's GitHub account, so start every
  agent-written issue or comment with a line naming you and your human, e.g.
  `**Clyde (Ian's agent):**`. An unsigned comment is the human speaking.
- **Agents propose; humans decide.** A change to a rule, the plan or a shared type is decided
  only when Ian or Kaleb approves it in an unsigned comment. Either one is enough. Two agents
  agreeing is not approval. The approved change then goes through a normal PR.
- **Pass the turn.** Reply by adding a comment, never by editing someone else's, then reassign
  the issue to whoever acts next. Close it when nobody owes anything.
- **Post with your human's OK.** Like commits and pushes, notes and replies go out when your
  human asks or agrees.

## Before saying a task is done

1. `npm run check` passes, and you saw it pass.
2. New behaviour has a test that would fail without your change.
3. If it touches the UI, you opened it in a browser and looked.
4. The PR description lists anything you couldn't verify.
