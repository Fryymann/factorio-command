# AGENTS.md

Guidance for coding agents (Claude Code, Codex, others) working in this repo. Two developers
share it, each with their own agent, so most of these rules are about not stepping on each
other and not shipping wrong numbers.

Read `README.md` for what the project is. `docs/migration.md` records how the port from
`artifacts/` was done.

## The project in one paragraph

A Factorio 2.1 (base game) production planner: a calculator, a module graph with flow
simulation, and a blueprint generator and editor. It is built with Vite + TypeScript under
`src/` into a single self-contained `dist/index.html`. The original single-file versions stay
in `artifacts/` as history.

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

| Path             | What lives there                          | Rule                                                                                |
| ---------------- | ----------------------------------------- | ----------------------------------------------------------------------------------- |
| `artifacts/`     | Frozen single-file versions               | Read-only history. Never edit them; `scripts/artifact-goldens.mjs` runs their code. |
| `data/*.json`    | Generated game data                       | Never edit by hand. Change the extractor.                                           |
| `scripts/`       | Tooling (data extraction)                 | Node 24 runs `.ts` directly; no build step.                                         |
| `src/data/`      | Types and loaders for game data           | Type changes affect everyone (see below).                                           |
| `src/solver/`    | Calculator math                           | Pure functions. No DOM.                                                             |
| `src/modules/`   | Module graph and flow simulation          | Pure functions. No DOM.                                                             |
| `src/blueprint/` | Tile layout, export, string encoding      | Pure functions. No DOM.                                                             |
| `src/editor/`    | Editor logic and belt-lane simulation     | Pure functions. No DOM.                                                             |
| `src/ui/`        | Rendering, events, canvas, `localStorage` | The only place that touches the browser.                                            |

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
- **PRs:** every change to `main` goes through a PR, approved by the other human. Squash-merge.
  Nobody pushes to `main`, and agents never do.
- **Plans go in the issue, not a PR.** Post a plan or design as a comment on its issue. The other
  side objects there if they want. A plan that changes shared types, saved data or the rules
  needs an unsigned OK from Ian or Kaleb on the issue before work starts.
- **Merging:** the author's side merges, once the other human has approved the PR's current
  head and `npm run check` passes on it. An approval of an earlier head doesn't count.
- **Agents commit, push and open PRs** on their own feature branches as part of the work their
  human asked for. They never push to `main`, force-push or delete branches unless their human
  asks.
- **Shared types:** a change to `src/data/types.ts` or any exported type used across folders
  must be called out in the PR description, because the other branch is probably building on it.
- **Windows and Linux.** Ian works on Windows, Kaleb on NixOS. Scripts, `npm` commands and tests
  must work on both: no hard-coded paths without a way to override them, no shell-only commands,
  and tests read only committed files (never `data/raw/`).
- **Stay in scope.** Don't reformat, rename or "tidy" code your task doesn't need. Prettier
  handles formatting; run `npm run format` on files you touched.
- **Handoffs go in GitHub.** Notes for the other developer or their agent go in the PR
  description or an issue (see "How agents work here" below), not in files in the repo.
- **Personal agent setup stays personal.** Agent identities, memory and personal preferences
  belong in your user-level config (e.g. `~/.claude/CLAUDE.md`), not in this repo.

## How agents work here

The step-by-step procedures for every agent in this repo are in
[`.claude/skills/repo-workflow/SKILL.md`](.claude/skills/repo-workflow/SKILL.md): session
start, starting work, opening, reviewing and merging PRs, issues and decisions. Claude Code loads
it as a skill; other agents read it directly. The rules it carries out:

- **The board is the source of truth** for who is doing what, whose turn it is, the roadmap
  order and what is blocked: the GitHub Project **factorio-command**. Read it at session start
  and keep it current as work moves.
- **Agent notes** are GitHub issues labelled `agent-note`, assigned to the human whose side
  acts next: Ian is `Fryymann`, Kaleb is `KalebMarquez`. Read the ones assigned to your
  human at session start, whole thread, and tell them what is waiting and from whom.
- **Sign what you write.** Agents post through their human's GitHub account, so start every
  agent-written issue or comment with a line naming you and your human, e.g.
  `**Clyde (Ian's agent):**`. An unsigned comment is the human speaking.
- **Agents act; humans decide.** Agents update the board and assignees, comment, create, edit
  and close issues, open PRs, request reviews and merge (under the merging rule above) on their
  own, and tell their human what they did. A change to a rule, the plan or a shared type is decided
  only when Ian or Kaleb approves it in an unsigned comment. Either one is enough. Two agents
  agreeing is not approval. The approved change then goes through a normal PR.
- **Pass the turn.** Reply by adding a comment, never by editing someone else's, then reassign
  to whoever acts next. Close it when nobody owes anything.

## Before saying a task is done

1. `npm run check` passes, and you saw it pass.
2. New behaviour has a test that would fail without your change.
3. If it touches the UI, you opened it in a browser and looked.
4. The PR description lists anything you couldn't verify.
