import { describe, expect, it } from "vitest";
import { BLUEPRINT_VERSION_2_0, decodeBlueprint, encodeBlueprint } from "./encode.ts";

describe("blueprint string encoding", () => {
  const sample = {
    blueprint: {
      item: "blueprint",
      label: "Test",
      version: BLUEPRINT_VERSION_2_0,
      entities: [
        { entity_number: 1, name: "transport-belt", position: { x: 0.5, y: 0.5 }, direction: 4 },
      ],
    },
  };

  it("starts with the version byte 0", async () => {
    expect((await encodeBlueprint(sample)).startsWith("0")).toBe(true);
  });

  it("round-trips through decode", async () => {
    expect(await decodeBlueprint(await encodeBlueprint(sample))).toEqual(sample);
  });

  it("rejects an unknown version byte", async () => {
    await expect(decodeBlueprint("1abc")).rejects.toThrow(/version byte/);
  });
});
