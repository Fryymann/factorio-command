// Box select and group editing for whole-chain edits (docs/chain-edit-plan.md section 5).
// Pure functions over an `EditSession`; the UI owns the drag gesture and the highlight.
import { begin, commit, entAt, recalc, remove } from "./actions.ts";
import type { EditSession } from "./actions.ts";
import { foot, tilesOf, tkey } from "./geometry.ts";
import type { EdEnt } from "./types.ts";

/** Tile rectangle, inclusive on both ends, in any corner order. */
export interface TileBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Every entity whose footprint overlaps the box, machines and pipe guides included. */
export function selectInBox(s: EditSession, box: TileBox): EdEnt[] {
  const x0 = Math.min(box.x0, box.x1);
  const x1 = Math.max(box.x0, box.x1);
  const y0 = Math.min(box.y0, box.y1);
  const y1 = Math.max(box.y0, box.y1);
  return s.ents.filter((e) => {
    const [w, h] = foot(e);
    return e.x <= x1 && e.x + w - 1 >= x0 && e.y <= y1 && e.y + h - 1 >= y0;
  });
}

/** Whether the group can shift by (dx, dy) without overlapping anything outside the group. */
export function canMoveGroup(s: EditSession, group: EdEnt[], dx: number, dy: number): boolean {
  const inGroup = new Set(group);
  return group.every((e) =>
    tilesOf(e, e.x + dx, e.y + dy).every((k) => {
      const o = s.sim.G.get(k);
      return !o || inGroup.has(o);
    }),
  );
}

/** Moves the group as one undoable step. Returns false, changing nothing, if it doesn't fit. */
export function moveGroup(s: EditSession, group: EdEnt[], dx: number, dy: number): boolean {
  if ((dx === 0 && dy === 0) || !group.length || !canMoveGroup(s, group, dx, dy)) return false;
  begin(s);
  for (const e of group) {
    e.x += dx;
    e.y += dy;
  }
  recalc(s);
  commit(s);
  return true;
}

/** Deletes everything but machines (which can only be moved) as one undoable step. */
export function deleteGroup(s: EditSession, group: EdEnt[]): number {
  const doomed = group.filter((e) => e.t !== "machine");
  if (!doomed.length) return 0;
  begin(s);
  for (const e of doomed) remove(s, e);
  commit(s);
  return doomed.length;
}

export const groupAt = (s: EditSession, x: number, y: number): EdEnt | undefined =>
  s.sim.G.get(tkey(x, y)) ?? entAt(s, x, y);
