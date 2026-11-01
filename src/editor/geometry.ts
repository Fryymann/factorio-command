// Directions and footprints. Ported from artifacts/FCP_v1-2.html (lines 1721-1737).
import type { Dir, EdEnt } from "./types.ts";

export const DV: Record<Dir, readonly [number, number]> = {
  N: [0, -1],
  E: [1, 0],
  S: [0, 1],
  W: [-1, 0],
};
export const ROT_CW: Record<Dir, Dir> = { N: "E", E: "S", S: "W", W: "N" };
export const ROT_CCW: Record<Dir, Dir> = { N: "W", W: "S", S: "E", E: "N" };
export const OPP: Record<Dir, Dir> = { N: "S", S: "N", E: "W", W: "E" };
/** The side on your left when facing that way. */
export const LEFT: Record<Dir, Dir> = { N: "W", E: "N", S: "E", W: "S" };

export const tkey = (x: number, y: number): string => x + "," + y;

export function foot(e: EdEnt): readonly [number, number] {
  if (e.t === "machine") return [e.w, e.h];
  if (e.t === "splitter") return e.dir === "N" || e.dir === "S" ? [2, 1] : [1, 2];
  return [1, 1];
}

export function tilesOf(e: EdEnt, x = e.x, y = e.y): string[] {
  const [w, h] = foot(e);
  const out: string[] = [];
  for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) out.push(tkey(x + dx, y + dy));
  return out;
}
