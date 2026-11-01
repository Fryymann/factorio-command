// The artifact saved machines, furnaces and belts by its own short keys. These map them to the
// game's entity names (docs/game-data-switchover-plan.md, "Global Constraints").
import { describe, expect, it } from "vitest";
import { migrateAsm, migrateBelt, migrateFurn, migrateMach } from "./savedKeys.ts";

describe("migrateAsm", () => {
  it("maps the artifact's assembler speeds", () => {
    expect(migrateAsm("0.5")).toBe("assembling-machine-1");
    expect(migrateAsm("0.75")).toBe("assembling-machine-2");
    expect(migrateAsm("1.25")).toBe("assembling-machine-3");
  });
  it("passes entity ids through and rejects anything else", () => {
    expect(migrateAsm("assembling-machine-3")).toBe("assembling-machine-3");
    expect(migrateAsm("chemical-plant")).toBeNull();
    expect(migrateAsm("2")).toBeNull();
    expect(migrateAsm(0.75)).toBeNull();
  });
});

describe("migrateFurn", () => {
  it("maps the artifact's furnace keys", () => {
    expect(migrateFurn("stone")).toBe("stone-furnace");
    expect(migrateFurn("steel")).toBe("steel-furnace");
    expect(migrateFurn("electric")).toBe("electric-furnace");
  });
  it("passes entity ids through and rejects anything else", () => {
    expect(migrateFurn("electric-furnace")).toBe("electric-furnace");
    expect(migrateFurn("assembling-machine-2")).toBeNull();
    expect(migrateFurn(undefined)).toBeNull();
  });
});

describe("migrateMach", () => {
  it("maps every artifact machine key", () => {
    expect(
      ["am1", "am2", "am3", "stone", "steel", "electric", "chem"].map((k) => migrateMach(k)),
    ).toEqual([
      "assembling-machine-1",
      "assembling-machine-2",
      "assembling-machine-3",
      "stone-furnace",
      "steel-furnace",
      "electric-furnace",
      "chemical-plant",
    ]);
  });
  it("passes known machines through and rejects anything else", () => {
    expect(migrateMach("chemical-plant")).toBe("chemical-plant");
    expect(migrateMach("am9")).toBeNull();
    expect(migrateMach("transport-belt")).toBeNull();
  });
});

describe("migrateBelt", () => {
  it("maps the artifact's belt rates, as strings or numbers", () => {
    expect(migrateBelt("15")).toBe("transport-belt");
    expect(migrateBelt(30)).toBe("fast-transport-belt");
    expect(migrateBelt("45")).toBe("express-transport-belt");
    expect(migrateBelt("60")).toBe("turbo-transport-belt");
  });
  it("passes belt ids through and rejects anything else", () => {
    expect(migrateBelt("transport-belt")).toBe("transport-belt");
    expect(migrateBelt("99")).toBeNull();
    expect(migrateBelt("")).toBeNull();
    expect(migrateBelt("underground-belt")).toBeNull();
  });
});

// Every JavaScript object answers to these names, so a plain obj[k] lookup would accept them
// (found in Kaleb's agent's review of #30). Saved data is only ever checked against own keys.
describe("JavaScript's built-in names", () => {
  for (const k of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) {
    it(`rejects ${k}`, () => {
      expect(migrateAsm(k)).toBeNull();
      expect(migrateFurn(k)).toBeNull();
      expect(migrateMach(k)).toBeNull();
      expect(migrateBelt(k)).toBeNull();
    });
  }
});
