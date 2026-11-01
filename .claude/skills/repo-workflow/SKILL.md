---
name: repo-workflow
description: Use in the factorio-command repo at session start, and whenever starting work on an issue, opening, updating, reviewing or merging a pull request, creating an issue, asking Ian or Kaleb to decide something, or checking whose turn it is or what is blocked.
---

# Working in factorio-command

Two humans (Ian, Kaleb) and their agents share this repo. The GitHub Project board
**factorio-command** is the one place that says who is doing what, whose turn it is, what comes
next and what is blocked. Keep it true as you work. AGENTS.md holds the rules; this file holds
the steps.

| Human | GitHub login   | Agent signs as                |
| ----- | -------------- | ----------------------------- |
| Ian   | `Fryymann`     | `**Clyde (Ian's agent):**`    |
| Kaleb | `KalebMarquez` | `**Claude (Kaleb's agent):**` |

## The board

https://github.com/users/Fryymann/projects/7 (views: Board, Roadmap, Whose turn). Every open issue
and PR is on it.

| Field     | Values                                                                   | Meaning                        |
| --------- | ------------------------------------------------------------------------ | ------------------------------ |
| Status    | To do, In progress, In review, Needs decision, Done                      | Where the work is              |
| Owner     | Ian, Kaleb                                                               | Whose side is doing the work   |
| Phase     | 1 Switch-over, 2 All recipes, 3 Fluid chains, 4 Retire artifact, Anytime | Roadmap order; no dates        |
| Assignees | `Fryymann`, `KalebMarquez`                                               | **Whose turn it is right now** |

An issue blocked by an open issue has no Status; step 6 moves it to To do once nothing blocks
it. Dependencies are GitHub's "blocked by" links between issues. `board.mjs` in this folder reads and
sets all of it (`node .claude/skills/repo-workflow/board.mjs --help`); it needs the `project`
scope on `gh` (`gh auth refresh -s project`, once).

Agents act on GitHub on their own: board fields, assignees, comments, issues, PRs, review
requests, and merges under step 6. Tell your human what you did. The humans decide rules, plan
choices and PR approvals.

## Procedures

### 1. Session start

1. `node .claude/skills/repo-workflow/board.mjs turn <your human's login>`: items whose turn is
   your side's, plus everything in Needs decision.
2. `gh issue list --label agent-note --state open --assignee <login>`; read each thread in full
   with `gh issue view <n> --comments`.
3. Tell your human what is waiting, from whom, and what is next in the lowest open Phase,
   before any other work.

### 2. Starting work on an issue

1. It is on the board, and nothing it is blocked by is open. If something is, say so and stop.
2. Set Status In progress, Owner your side, assign your human.
3. If the work needs a plan, post it as a comment on the issue. If the plan changes shared types,
   saved data or the rules, wait for an unsigned OK from Ian or Kaleb on the issue.
4. `git fetch`, branch `<name>/<topic>` from `origin/main`.

### 3. Opening a PR

1. `npm run check` passes and you saw it (see 8).
2. Description, in this order, signed:
   - What changed, per commit if several.
   - **Shared type changes**, or "none".
   - Checked: commands run, browser checks with the numbers you read.
   - Not verified.
   - Issue links. A closing word before `#n` (close, closes, closed, fix, fixes, fixed,
     resolve, resolves, resolved) closes that issue on merge, anywhere in the description or a
     commit message. Use one only for an issue this PR finishes; for anything else write
     `Part of #n`.
3. Request review from the other human. Board: Status In review, assign the reviewer.
4. Never refer to an issue or comment you have not created yet.

### 4. Reviewing the other side's PR

1. Check out the PR head, `npm run check`, then open the built app (`npm run build`,
   `dist/index.html`) and read **every** table and number the change can touch, not just the
   first one that looks right.
2. Post a signed review. Grade each finding by its effect on a player: a wrong or missing
   number is never minor, however unlikely the input.
3. An agent's review is advice. Approval is your human's unsigned review; post "Approve" only
   when your human says so.
4. Board: assign the PR's author side if changes are needed; leave it with the reviewer
   otherwise.

### 5. Pushing to a PR that is already approved

The push dismisses the approval. In the same step, comment (signed) on what changed and ask for
re-approval, and assign the reviewer again.

### 6. Merging

1. Merge only when both are true:
   - `gh pr view <n> --json reviewDecision` says `APPROVED`, from the other human, on the
     current head; and
   - `npm run check` passes on the current head.

   If either is missing, don't merge, whoever asks. Say which one is missing and how to get it.

2. The author's side merges. Squash. Tell your human it's merged.
3. Board: Done. Then list what the merged issue was blocking; anything now unblocked goes to To do
   and is mentioned to your human.

### 7. New issues and decisions

- New issue: label it, sign it, add it to the board with a Phase, and link "blocked by".
- A choice only the humans can make: Status Needs decision, assign both humans, and list the
  options in the issue. Record the decision in a comment once made.

### 8. Before calling anything done

- `npm run check` passes and you read the output.
- UI changes: opened in a browser, every affected table read.
- Works on Windows and Linux/NixOS: no hard-coded paths without an override, tests read only
  committed files.
- Review findings you defer go into the PR's "Not verified" with their effect stated.

## Common mistakes

| Mistake                                                            | What to do instead                                           |
| ------------------------------------------------------------------ | ------------------------------------------------------------ |
| "which closes #4" in a PR body closed #4 early                     | Only `Closes #n` for what the PR finishes; else `Part of #n` |
| Browser check read the build list, missed a blank inputs table     | Read every table the change touches                          |
| Deferred a fix as "only odd data" while it put NaN on screen       | Grade by effect on the player                                |
| Pushed to an approved PR without saying the approval was dismissed | Step 5, in the same step as the push                         |
| Comment said "has its own issue" before the issue existed          | Create first, then reference                                 |
| Board left stale after a merge                                     | Step 6, every merge                                          |
| "My human said merge it, so I can merge without the re-approval"   | Step 6 needs the other human's approval, whoever asks        |
| "They approved before my fix, so it's fine to merge"               | The push dismissed it; step 5, then step 6                   |
