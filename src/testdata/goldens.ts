// Reference values produced by the artifact itself, given the game's ingredient order
// (scripts/artifact-goldens.mjs).
import { createHash } from "node:crypto";
import data from "./artifact-goldens.json" with { type: "json" };
import { migrateLayouts } from "../modules/migrate.ts";
import type { SavedLayout } from "../modules/storage.ts";
import type { ModuleGraph } from "../modules/types.ts";

export interface Golden {
  /** The artifact's module graph, migrated to entity names by the app's own migration. */
  graph: ModuleGraph;
  /** The same graph exactly as the artifact saved it ("am2", belt "15"). */
  artifactGraph: ModuleGraph;
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
export const goldens = Object.fromEntries(
  Object.entries(data as unknown as Record<string, Golden>).map(([name, g]) => {
    const artifactGraph = g.graph;
    const L = migrateLayouts({ g: { id: "g", ...artifactGraph } as SavedLayout }).g!;
    const graph: ModuleGraph = { name: L.name, nodes: L.nodes, edges: L.edges };
    return [name, { ...g, graph, artifactGraph }];
  }),
) as { green: Golden; blue: Golden };

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
