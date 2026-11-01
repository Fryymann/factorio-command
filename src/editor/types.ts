// Editable blueprint entities. Shape matches `edFromLayout` in artifacts/FCP_v1-2.html (line 1738).
// Shared across src/editor, src/blueprint and (later) src/ui: call out changes in the PR.
import type { Dir } from "../blueprint/layout.ts";

export type { Dir };
export type InsKind = "basic" | "fast" | "bulk" | "long";

export type EdEnt =
  | { t: "belt"; x: number; y: number; dir: Dir; feed?: string }
  | { t: "ug"; x: number; y: number; dir: Dir; io: "input" | "output" }
  | { t: "splitter"; x: number; y: number; dir: Dir }
  | { t: "ins"; x: number; y: number; dir: Dir; kind: InsKind }
  | { t: "pole"; x: number; y: number }
  | { t: "pipe"; x: number; y: number; item: string; pdir: "in" | "out" }
  | {
      t: "machine";
      x: number;
      y: number;
      w: number;
      h: number;
      item: string;
      ent: string;
      mname: string;
      recipe: string | null;
    };

/** A saved edit of one blueprint layout. */
export interface EditDoc {
  ents: EdEnt[];
}
