# Plan: make the whole-chain blueprint editable

On the Blueprint tab, each single module can be edited, but the whole chain can't. Line numbers
refer to `artifacts/FCP_v1-2.html` at commit `42f84e0`.

## Why it isn't editable today

- `renderBlueprint` only builds an edit key when the scope isn't the whole chain
  (`editKey = bp.scope !== "all" ? bp.scope : null`, line 1493). For the whole chain that key is
  empty, so the Edit button stays hidden (line 1496).
- The Edit button's click handler also returns early for the whole chain
  (`if (bp.scope === "all") return;`, line 2129).
- Saved edits are stored per module only (`L.edits[nodeId]`), and the whole chain has nowhere to
  store an edit.

The editing tools themselves (`laneSim`, placing, moving, undo) don't depend on scope. Most of
the work is wiring the whole chain in and handling its size.

## 0. Where the work happens

`artifacts/` is read-only (see `AGENTS.md`), so this is built in the TypeScript port, as the
first feature after the editor and blueprint code have been ported. Only
`src/blueprint/encode.ts` exists so far.

1. **Port and pin the existing behaviour first**, with tests and no changes (migration task 1):
   - `planLayout` goes to `src/blueprint/layout.ts`.
   - `bpSolution`, `bpEntry` and `graphDepth` go to `src/blueprint/fromModules.ts`.
   - `edFromLayout`, `foot`, `tilesOf` and `laneSim` go to `src/editor/`.
   - The editor actions (`edAdd`, `edRemove`, `edPlace`, undo, and so on) go to
     `src/editor/actions.ts`, rewritten as pure functions over an `EditDoc`. Today they reach
     into the globals `BP` and `ED`.
   - Merge `blueprintObject` and `edBlueprintObject` into one exporter, as `docs/migration.md`
     asks.
2. **Then add whole-chain editing in a separate PR**, as described below.

## 1. Data model and storage

- Today a layout's edits live in `L.edits[nodeId]`. Store the chain edit in a separate field,
  `L.chainEdit`, rather than in `L.edits["all"]`. That way it can never collide with a node id,
  and older code that loops over `edits` skips it.
- Each saved edit carries a snapshot of what it was generated from:
  ```ts
  interface ChainEdit {
    ents: EdEnt[];
    basis: {
      belt: string;
      ins: string;
      maxRow: number;
      machines: Record<ItemId, { count: number; mach: string }>;
    };
  }
  ```
  The single-module stale check only works for one node: it compares one machine count and one
  item (lines 1505–1506). The chain needs this per-item basis to tell the user what changed.
- **Size matters at chain scale.** A full chain can have thousands of entities, `localStorage`
  holds about 5 MB, and `plSave` swallows errors (line 690). So:
  - Make the save report a quota failure to the user instead of losing the edit silently. This
    is required by the "saved user data survives" rule.
  - Store entities compactly, e.g. tuples, or runs of identical belts. Write a loader that reads
    the old object form too, and test it.
- The shape of `fcp-layouts` changes, so add a migration plus a round-trip test.

## 2. Turning chain editing on

- `renderBlueprint` sets the edit key to `scope === "all" ? "chain" : nodeId`, and `BP.edit`
  reads from `chainEdit` or `edits[nodeId]` to match. `ED.undoKey` already resets undo history
  when the key changes, so it works as is.
- The Edit and Discard handler (line 2127) gets a chain branch:
  `chainEdit = edFromLayout(lay, bp)` with the basis filled in. Discard keeps its existing
  two-click confirm.
- `edFromLayout` already turns raw bus columns into `feed` belts (`rawTop`) and keeps machines,
  recipes and pipe guides. Check that this holds for a chain with several rows, a split product
  (`part`/`parts`), and a column that has splitters.

## 3. Stale-edit warnings for the chain

When the module graph changes after editing, compare the basis with the current `bpSolution()`
and warn for each difference:

- an item's machine count changed (old count → new count)
- an item was added to or removed from the chain
- a machine type changed
- belt tier or inserter type changed. Belt tier changes the underground reach (`U`) that
  `laneSim` uses.

Each warning offers "Discard edits". Never quietly regenerate a chain someone has edited.

## 4. Scale and performance

- `laneSim` is a fixed-point loop over every entity (`guard < 500`), and `edRecalc` runs on every
  placed tile and on every drag step. Before optimising, benchmark it on a large chain (for
  example a full blue-science chain) using a fixture.
- Likely fixes:
  - Use a worklist that only re-processes tiles whose lanes changed, instead of rescanning all
    entities.
  - During drags, run the simulation once on pointer-up rather than on every move.
- Undo stores a `JSON.stringify` of all entities for each of 80 steps, which could reach tens of
  MB on a big chain. Switch to storing changes (add, remove, modify) or cap the history by size.
- Drawing: `edDraw` already culls the grid, but it draws every entity. Skip entities outside the
  viewport.

## 5. Editing features the chain needs

These aren't strictly required, but without them editing a chain isn't practical:

- **Box select and multi-move.** Today you can only drag one piece at a time, so moving a row
  means dozens of drags. Add drag-to-select (for example Shift+drag), move the selection as a
  group (checking it fits, as `edFits` does), delete the selection, and undo it as one step.
- **Keep the chain annotations in edit mode.** Edit mode currently loses the bus column labels,
  the row labels and the "↓ item out" marker. Keep column labels by drawing labels on feed
  belts, which already happens at line 2035, plus product columns. Row labels can come from
  machine clusters.
- **Checks panel:** with dozens of results, group them by item and keep the existing
  click-to-jump.
- **Machines:** leave add/delete out of scope for now. Changing machine counts belongs on the
  Modules tab, and the stale warning covers it.

## 6. Export

- Use the merged exporter. Inserter direction is a known bug: the generated path writes
  `direction: 0` (line 1415), while the edited path writes `DIR16[OPP[dir]]`. Settle this with an
  in-game check before shipping, because an exported chain blueprint uses the edited path.
- Keep the "pipes not included" note.
- Label the blueprint `<chain name> (edited)`, cut to 100 characters, as now.

## 7. Tests (with real values)

- **Round trip:** a generated chain (green science from plates) goes through `edFromLayout` and
  the exporter with no edits, and must match `blueprintObject` entity for entity (apart from the
  inserter-direction fix, which should be noted).
- **Lane simulation on an untouched chain:** no mixed lanes, and every machine gets every
  ingredient. This also tests the generator.
- **Edit actions:** a move, a belt drag and an erase each change exactly the expected entities,
  and undo restores the starting state.
- **Stale detection:** change one machine count and expect exactly one warning that names the
  item and both counts.
- **Storage:** load an old `fcp-layouts` that has only per-module `edits`, then save and reload a
  `chainEdit`. Simulate a quota error and check that the user sees it.
- **Performance guard:** `laneSim` on the large fixture stays under a set time budget.

## 8. PR breakdown

1. Port the editor and lane simulation, with tests pinning today's behaviour (no behaviour
   change).
2. Merge the two exporters and fix inserter direction (separate PR, checked in game).
3. Add `chainEdit`: data model, storage migration, enable/discard, stale warnings.
4. Performance: incremental lane simulation and undo that stores changes.
5. Box select and multi-move, plus annotations in edit mode.

PR 3 changes the saved layout shape and adds an exported type, so its description has to say so
for the other developer.
