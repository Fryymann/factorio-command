// fcp-layouts from before the switch to game data name machines by the artifact's keys ("am2")
// and belts by their rate ("15", sometimes the number 15). This maps them to entity names. A
// value it doesn't recognise throws, naming the layout and the value, so the caller can refuse
// the load and leave the saved data untouched rather than guess. Version 2 data goes through it
// too: entity names pass through unchanged, and every machine, belt, item and blueprint inserter
// type is still checked.
import { GAME, own, recipesFor } from "../data/game.ts";
import { INSERTERS } from "../data/legacy.ts";
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
    throw new Error(`${where} names ${what} this version doesn't know: ${JSON.stringify(v)}.`);
  };
  const mach = (v: unknown) => migrateMach(v) ?? fail("a machine", v);
  // The artifact's simulation read a missing belt as the transport belt (15/s).
  const belt = (v: unknown) =>
    v === undefined || v === null || v === ""
      ? "transport-belt"
      : (migrateBelt(v) ?? fail("a belt", v));

  const recipe = (forItem: string, v: unknown) =>
    recipesFor(forItem).some((r) => r.id === v) ? (v as string) : fail("a recipe", v);
  const item = (v: unknown) =>
    typeof v === "string" && own(GAME.items, v) ? v : fail("an item", v);
  const ins: unknown = L.bp?.ins;
  if (ins !== undefined && !(typeof ins === "string" && own(INSERTERS, ins)))
    fail("an inserter", ins);

  const out: SavedLayout = {
    ...L,
    nodes: (L.nodes ?? []).map((n) =>
      n.kind === "machine"
        ? {
            ...n,
            item: item(n.item),
            mach: mach(n.mach),
            ...(n.recipe === undefined ? {} : { recipe: recipe(n.item, n.recipe) }),
          }
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
