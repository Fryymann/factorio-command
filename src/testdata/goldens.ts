// Reference values produced by the artifact itself (scripts/artifact-goldens.mjs).
import { createHash } from "node:crypto";
import data from "./artifact-goldens.json" with { type: "json" };
import type { ModuleGraph } from "../modules/types.ts";

export interface Golden {
  graph: ModuleGraph;
  solBuild: {
    id: string;
    rate: number;
    depth: number;
    exact: number;
    count: number;
    mach: string;
  }[];
  solInputs: [string, number][];
  solMeta: { title: string; icon: string; label: string; warn: string[] };
  layout: {
    W: number;
    H: number;
    xb: number;
    jxA: number;
    rowX0: number;
    warn: string[];
    conflicts: number;
    counts: Record<string, number>;
    pairs: number;
    cols: [string, number, boolean, number, number][];
    rows: [string, number, number, number, number, number, string[]][];
    entsHash: string;
    nEnts: number;
  };
  ed: { n: number; hash: string; feeds: [number, number, string][] };
  lane: { checks: [number | null, number | null, string][]; mixed: number; pairs: number };
  bpoHash: string;
  bpoN: number;
  edBpoHash: string;
  edBpoLabel: string;
}

/** green: 8 AM2 of logistic science from plates. blue: 10 AM2 of chemical science from plates. */
export const goldens = data as unknown as { green: Golden; blue: Golden };

/** Hash of a value with object keys sorted, as the generator computes it. */
export function canonHash(v: unknown): string {
  const s = JSON.stringify(v, (k, x: unknown) =>
    k === "tok"
      ? undefined
      : x && typeof x === "object" && !Array.isArray(x)
        ? Object.fromEntries(
            Object.keys(x)
              .sort()
              .map((kk) => [kk, (x as Record<string, unknown>)[kk]]),
          )
        : x,
  );
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}
