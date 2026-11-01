// Editor actions as functions over an `EditSession`, with no globals and no DOM. Ported from
// the "state + actions" block of artifacts/FCP_v1-2.html (lines 1853-1899), where these reached
// into the globals `BP` and `ED`. Selection, tool choice and redraws stay in the UI.
// Functions mutate the session they are given, as the artifact mutated its globals.
import { tilesOf, tkey, DV, ROT_CCW, ROT_CW } from "./geometry.ts";
import { laneSim } from "./laneSim.ts";
import type { LaneSimResult } from "./laneSim.ts";
import type { Dir, EdEnt, EditDoc, InsKind } from "./types.ts";

export const UNDO_LIMIT = 80;

export interface EditSession {
  ents: EdEnt[];
  /** Underground reach of the current belt tier. */
  U: number;
  sim: LaneSimResult;
  /** Committed steps, oldest first. Each holds only what that step changed. */
  undo: UndoStep[];
  /** State captured by `begin`, waiting for `commit`. */
  snap: Snapshot | null;
}

/**
 * What one step changed. Entities are kept by reference so older steps stay valid after a newer
 * one is undone: a removed entity is put back as the same object.
 */
export interface UndoStep {
  /** Entities the step added. */
  added: EdEnt[];
  /** Entities the step removed, with their position in the list before the step. */
  removed: { index: number; ent: EdEnt }[];
  /** Entities the step edited in place, with their JSON from before the step. */
  modified: { ent: EdEnt; before: string }[];
}

export interface Snapshot {
  list: EdEnt[];
  json: Map<EdEnt, string>;
}

export type Tool = "select" | "belt" | "ug" | "ins" | "pole" | "feed" | "erase";

export interface ToolState {
  tool: Tool;
  dir: Dir;
  insKind: InsKind;
  feed: string;
}

export function createSession(doc: EditDoc, U: number): EditSession {
  return { ents: doc.ents, U, sim: laneSim(doc.ents, U), undo: [], snap: null };
}

export function recalc(s: EditSession): void {
  s.sim = laneSim(s.ents, s.U);
}

export const entAt = (s: EditSession, x: number, y: number): EdEnt | undefined =>
  s.sim.G.get(tkey(x, y));

/** Whether `e` could sit with its corner at (x, y) without overlapping anything else. */
export function fits(s: EditSession, e: EdEnt, x: number, y: number): boolean {
  return tilesOf(e, x, y).every((k) => {
    const o = s.sim.G.get(k);
    return !o || o === e;
  });
}

export function add(s: EditSession, e: EdEnt): boolean {
  if (!fits(s, e, e.x, e.y)) return false;
  s.ents.push(e);
  recalc(s);
  return true;
}

export function remove(s: EditSession, e: EdEnt): void {
  s.ents = s.ents.filter((x) => x !== e);
  recalc(s);
}

export function placeBelt(s: EditSession, x: number, y: number, dir: Dir): void {
  const ex = entAt(s, x, y);
  if (ex && ex.t === "belt") {
    ex.dir = dir;
    recalc(s);
  } else if (!ex) add(s, { t: "belt", x, y, dir });
}

export function place(s: EditSession, ts: ToolState, x: number, y: number): void {
  const ex = entAt(s, x, y);
  if (ts.tool === "ins") {
    if (ex && ex.t === "ins") {
      ex.kind = ts.insKind;
      ex.dir = ts.dir;
      recalc(s);
    } else if (!ex) add(s, { t: "ins", x, y, dir: ts.dir, kind: ts.insKind });
  } else if (ts.tool === "pole") {
    if (!ex) add(s, { t: "pole", x, y });
  } else if (ts.tool === "ug") {
    if (ex) return;
    const [dx, dy] = DV[ts.dir];
    let io: "input" | "output" = "input";
    for (let k = 1; k <= s.U + 1; k++) {
      const o = entAt(s, x - dx * k, y - dy * k);
      if (o && o.t === "ug" && o.dir === ts.dir) {
        if (o.io === "input" && !s.sim.pair.has(o)) io = "output";
        break;
      }
    }
    add(s, { t: "ug", x, y, dir: ts.dir, io });
  } else if (ts.tool === "feed") {
    if (ex && ex.t === "belt") {
      if (ex.feed === ts.feed) delete ex.feed;
      else ex.feed = ts.feed;
      recalc(s);
    } else if (!ex) add(s, { t: "belt", x, y, dir: ts.dir, feed: ts.feed });
  }
}

/** Removes anything but a machine. Machines can only be moved. */
export function erase(s: EditSession, x: number, y: number): void {
  const ex = entAt(s, x, y);
  if (ex && ex.t !== "machine") remove(s, ex);
}

/** Start an undoable step. Pair with `commit`. */
export function begin(s: EditSession): void {
  s.snap = { list: [...s.ents], json: new Map(s.ents.map((e) => [e, JSON.stringify(e)])) };
}

/** Finish the step started by `begin`. Returns true when something changed. */
export function commit(s: EditSession): boolean {
  const snap = s.snap;
  if (snap === null) return false;
  s.snap = null;
  const now = new Set(s.ents);
  const step: UndoStep = { added: [], removed: [], modified: [] };
  for (const e of s.ents) {
    const was = snap.json.get(e);
    if (was === undefined) step.added.push(e);
    else if (was !== JSON.stringify(e)) step.modified.push({ ent: e, before: was });
  }
  snap.list.forEach((ent, index) => {
    if (!now.has(ent)) step.removed.push({ index, ent });
  });
  if (!step.added.length && !step.removed.length && !step.modified.length) return false;
  s.undo.push(step);
  if (s.undo.length > UNDO_LIMIT) s.undo.shift();
  return true;
}

/** Restores the state before the last committed step. */
export function undo(s: EditSession): boolean {
  const step = s.undo.pop();
  if (step === undefined) return false;
  const added = new Set(step.added);
  const list = s.ents.filter((e) => !added.has(e));
  // ascending index order puts each removed entity back where it was
  for (const r of [...step.removed].sort((a, b) => a.index - b.index))
    list.splice(r.index, 0, r.ent);
  for (const m of step.modified) {
    for (const k of Object.keys(m.ent)) delete (m.ent as unknown as Record<string, unknown>)[k];
    Object.assign(m.ent, JSON.parse(m.before));
  }
  s.ents = list;
  recalc(s);
  return true;
}

/** Rotates a belt, inserter or underground as one undoable step. */
export function rotate(s: EditSession, e: EdEnt, ccw: boolean): boolean {
  if (e.t !== "belt" && e.t !== "ins" && e.t !== "ug") return false;
  begin(s);
  e.dir = (ccw ? ROT_CCW : ROT_CW)[e.dir];
  recalc(s);
  commit(s);
  return true;
}

/** Deletes a piece as one undoable step. Machines can't be deleted. */
export function deleteEnt(s: EditSession, e: EdEnt): boolean {
  if (e.t === "machine") return false;
  begin(s);
  remove(s, e);
  commit(s);
  return true;
}
