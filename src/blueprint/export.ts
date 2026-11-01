// Blueprint JSON from entities (generated via `edFromLayout`, or edited). One exporter replaces
// the artifact's `blueprintObject` and `edBlueprintObject` (artifacts/FCP_v1-2.html, lines
// 1407-1423 and 2136-2150).
//
// Inserter direction: Factorio stores the *pickup* side, so the drop direction is written as
// DIR16[OPP[dir]]. The generated path used a hard-coded 0 (north), and every generated inserter
// drops south (OPP[S] = N = 0), so the merge changes no output. The OPP convention itself has not
// been checked in game; see the PR description.
import { BLUEPRINT_VERSION_2_0 } from "./encode.ts";
import { INS_KINDS } from "../data/legacy.ts";
import type { BeltTier } from "../data/legacy.ts";
import { foot, OPP } from "../editor/geometry.ts";
import type { EdEnt } from "../editor/types.ts";
import type { Dir } from "./layout.ts";

/** 16-way directions in Factorio 2.0. */
export const DIR16: Record<Dir, number> = { N: 0, E: 4, S: 8, W: 12 };

export interface BlueprintEntity {
  entity_number: number;
  name: string;
  position: { x: number; y: number };
  direction?: number;
  type?: "input" | "output";
  recipe?: string;
}

export interface BlueprintObject {
  blueprint: {
    entities: BlueprintEntity[];
    item: "blueprint";
    label: string;
    version: number;
    icons?: { signal: { type: "item"; name: string }; index: number }[];
  };
}

function wrap(
  entities: BlueprintEntity[],
  icon: string | null | undefined,
  label: string,
): BlueprintObject {
  const bp: BlueprintObject["blueprint"] = {
    entities,
    item: "blueprint",
    label: label.slice(0, 100),
    version: BLUEPRINT_VERSION_2_0,
  };
  if (icon) bp.icons = [{ signal: { type: "item", name: icon }, index: 1 }];
  return { blueprint: bp };
}

export function blueprintObject(
  ents: EdEnt[],
  tier: BeltTier,
  icon: string | null | undefined,
  label: string,
): BlueprintObject {
  const out: BlueprintEntity[] = [];
  let n = 1;
  for (const e of ents) {
    const [w, h] = foot(e);
    const position = { x: e.x + w / 2, y: e.y + h / 2 };
    if (e.t === "belt")
      out.push({ entity_number: n++, name: tier.belt, position, direction: DIR16[e.dir] });
    else if (e.t === "ug")
      out.push({
        entity_number: n++,
        name: tier.ug,
        position,
        direction: DIR16[e.dir],
        type: e.io,
      });
    else if (e.t === "splitter")
      out.push({ entity_number: n++, name: tier.sp, position, direction: DIR16[e.dir] });
    else if (e.t === "ins")
      out.push({
        entity_number: n++,
        name: INS_KINDS[e.kind].ent,
        position,
        direction: DIR16[OPP[e.dir]],
      });
    else if (e.t === "pole")
      out.push({ entity_number: n++, name: "small-electric-pole", position });
    else if (e.t === "machine") {
      const o: BlueprintEntity = { entity_number: n++, name: e.ent, position };
      if (e.recipe) o.recipe = e.recipe;
      out.push(o);
    }
  }
  return wrap(out, icon, label);
}
