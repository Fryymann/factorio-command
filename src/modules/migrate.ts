// fcp-layouts from before the switch to game data name machines by the artifact's keys ("am2")
// and belts by their rate ("15", sometimes the number 15). This maps them to entity names. A
// value it doesn't recognise throws, naming the layout and the value, so the caller can refuse
// the load and leave the saved data untouched rather than guess. Version 2 data goes through it
// too: entity names pass through unchanged, and every machine, belt and item is still checked.
import { GAME } from "../data/game.ts";
import { migrateBelt, migrateMach } from "../data/savedKeys.ts";
import type { SavedLayout } from "./storage.ts";

type Raw = Record<string, unknown>;

/** Every layout of an fcp-layouts value, with entity names. Entity names pass through. */
export function migrateLayouts(layouts: Record<string, SavedLayout>): Record<string, SavedLayout> {
  return Object.fromEntries(Object.entries(layouts).map(([id, L]) => [id, migrateLayout(L)]));
}

function migrateLayout(L: SavedLayout): SavedLayout {
  const where = `Layout "${String(L.name ?? L.id)}"`;
  const fail = (what: string, v: unknown): never => {
    throw new Error(`${where} names a ${what} this version doesn't know: ${JSON.stringify(v)}.`);
  };
  const mach = (v: unknown) => migrateMach(v) ?? fail("machine", v);
  // The artifact's simulation read a missing belt as the transport belt (15/s).
  const belt = (v: unknown) =>
    v === undefined || v === null || v === ""
      ? "transport-belt"
      : (migrateBelt(v) ?? fail("belt", v));

  const item = (v: unknown) => (typeof v === "string" && GAME.items[v] ? v : fail("item", v));

  const out: SavedLayout = {
    ...L,
    nodes: (L.nodes ?? []).map((n) =>
      n.kind === "machine"
        ? { ...n, item: item(n.item), mach: mach(n.mach) }
        : n.kind === "source"
          ? { ...n, item: item(n.item) }
          : n,
    ),
    edges: (L.edges ?? []).map((e) => ({ ...e, belt: belt(e.belt) })),
  };
  if (L.bp && L.bp.belt !== undefined) out.bp = { ...L.bp, belt: belt(L.bp.belt) };
  const ce = (L as unknown as { chainEdit?: Raw }).chainEdit;
  if (ce && typeof ce.basis === "object" && ce.basis !== null) {
    const basis = ce.basis as Raw & { machines?: Record<string, Raw> };
    const machines = Object.fromEntries(
      Object.entries(basis.machines ?? {}).map(([id, m]) => [id, { ...m, mach: mach(m.mach) }]),
    );
    (out as { chainEdit?: unknown }).chainEdit = {
      ...ce,
      basis: { ...basis, belt: belt(basis.belt), machines },
    };
  }
  return out;
}
