import { describe, expect, it } from "vitest";
import { BLUEPRINT_VERSION, decodeBlueprint, encodeBlueprint } from "./encode.ts";

describe("blueprint string encoding", () => {
  const sample = {
    blueprint: {
      item: "blueprint",
      label: "Test",
      version: BLUEPRINT_VERSION,
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

  it("writes the version Factorio 2.1.24 writes", async () => {
    // Exported from Factorio 2.1.24 (build 87808, base game) by Ian on 2026-11-01: one of this
    // planner's blueprints, imported into the game and exported again.
    const fromGame =
      "0eNqt19tu2zAMANBfKfS0AnYR3Xx73WcUQyHbWidAlj1JGVYE/vcp7pJii52QQZ+C+HJIk6JgH0hr93ryxkXSHIjpRhdI83wgwbw6ZY/HnBo0aUg3TpP2eadaq8mcEeN6/Zs0dP6WEe2iiUa/37n8eXtx+6HVPl2QnQQVgh5aa9xrPqjuh3E6ZyQj0xjSzaM7xkqgfJIZeSNN+SRTFK87M12EPx1/+blXNgVL593oh5TvnF0kwM4JfFch5sYF7WM6cRFZ/I2cMphXHH52Qopkc211F73p8mlcUvpPK65rAptVve5IqCOvO8V9T7ehlcimV5/d9ApalvJ6m2pcWerrGt1h09qoL6VQqLoBsfsecIvjyMZT+tmdp+DJorsb3ZK42lB2wyvQmW2VuQRL9IZU3fmMW97HwESvXJhGH/NW27i9MsXS+d6kHr+fFWub+A7s1iiXgt1zU2Awg8MUBXM4zFCwwGd8rMm/MmVrtMRXGUoX6IUBlUv0UobKFVgukTJ8/AqczOEDKJEyfAQFUobPIN+UqzUYPoOn5QxzBdqlIFeiXQZyC7QL2op4iW8crBAVHoZVAj54qN1ewMcOtdkLii4EzGXoYYa5HL39wFyB3jBhrkRv8TAXP3H8cv2mT3YT9ZCQj6//jFiVoHTs6/Lu/bC8ez8MY79PP190n+7oH9Nlv7QPiyMLVkvBRF0XVJR8nv8AUMJXGQ==";
    const { blueprint } = (await decodeBlueprint(fromGame)) as { blueprint: { version: number } };
    expect(blueprint.version).toBe(BLUEPRINT_VERSION);
    // 2.1.24.1 as four 16-bit fields
    expect(BLUEPRINT_VERSION).toBe(2 * 2 ** 48 + 1 * 2 ** 32 + 24 * 2 ** 16 + 1);
  });
});
