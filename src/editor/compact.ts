// Compact storage form for edited entities. A full chain has thousands of entities and
// `localStorage` holds about 5 MB, so each entity is saved as a short tuple instead of an object.
// `decodeEnts` also reads the old object form, which is what the single-module `edits` use.
import type { Dir, EdEnt } from "./types.ts";

export type Tuple =
  | ["b", number, number, Dir]
  | ["b", number, number, Dir, string]
  | ["u", number, number, Dir, "input" | "output"]
  | ["s", number, number, Dir]
  | ["i", number, number, Dir, "basic" | "fast" | "bulk" | "long"]
  | ["p", number, number]
  | ["P", number, number, string, "in" | "out"]
  | ["m", number, number, number, number, string, string, string, string | null];

export function encodeEnts(ents: EdEnt[]): Tuple[] {
  return ents.map((e): Tuple => {
    switch (e.t) {
      case "belt":
        return e.feed ? ["b", e.x, e.y, e.dir, e.feed] : ["b", e.x, e.y, e.dir];
      case "ug":
        return ["u", e.x, e.y, e.dir, e.io];
      case "splitter":
        return ["s", e.x, e.y, e.dir];
      case "ins":
        return ["i", e.x, e.y, e.dir, e.kind];
      case "pole":
        return ["p", e.x, e.y];
      case "pipe":
        return ["P", e.x, e.y, e.item, e.pdir];
      case "machine":
        return ["m", e.x, e.y, e.w, e.h, e.item, e.ent, e.mname, e.recipe];
    }
  });
}

function decodeTuple(t: Tuple): EdEnt {
  switch (t[0]) {
    case "b":
      return t[4] === undefined
        ? { t: "belt", x: t[1], y: t[2], dir: t[3] }
        : { t: "belt", x: t[1], y: t[2], dir: t[3], feed: t[4] };
    case "u":
      return { t: "ug", x: t[1], y: t[2], dir: t[3], io: t[4] };
    case "s":
      return { t: "splitter", x: t[1], y: t[2], dir: t[3] };
    case "i":
      return { t: "ins", x: t[1], y: t[2], dir: t[3], kind: t[4] };
    case "p":
      return { t: "pole", x: t[1], y: t[2] };
    case "P":
      return { t: "pipe", x: t[1], y: t[2], item: t[3], pdir: t[4] };
    case "m":
      return {
        t: "machine",
        x: t[1],
        y: t[2],
        w: t[3],
        h: t[4],
        item: t[5],
        ent: t[6],
        mname: t[7],
        recipe: t[8],
      };
    default:
      throw new Error(`Unknown saved entity code ${JSON.stringify((t as unknown[])[0])}`);
  }
}

/** Reads tuples or the old object form. Throws on anything else rather than dropping entities. */
export function decodeEnts(raw: unknown): EdEnt[] {
  if (!Array.isArray(raw)) throw new Error("Saved entities are not a list");
  return raw.map((r: unknown) => {
    if (Array.isArray(r)) return decodeTuple(r as Tuple);
    if (r && typeof r === "object" && typeof (r as { t?: unknown }).t === "string")
      return r as EdEnt;
    throw new Error("Unreadable saved entity");
  });
}
