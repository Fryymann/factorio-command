import { describe, expect, it } from "vitest";
import { DEFAULT_STATE, parseState } from "./storage.ts";

describe("parseState (fcp-state)", () => {
  it("returns defaults when nothing is saved", () => {
    expect(parseState(null).state).toEqual(DEFAULT_STATE);
  });

  it("reads what the artifact wrote", () => {
    const saved = {
      item: "chemical-science-pack",
      amount: "10",
      mode: "rate",
      asm: "1.25",
      furn: "electric",
      belt: "30",
      unit: "1",
      imports: ["iron-plate"],
    };
    expect(parseState(JSON.stringify(saved)).state).toEqual(saved);
  });

  it("drops invalid fields one by one rather than trusting them", () => {
    const { state } = parseState(
      JSON.stringify({ item: "x", asm: "9", furn: "lava", unit: "7", imports: [1, "coal"] }),
    );
    expect(state.item).toBe("x"); // the UI resets unknown items; the loader only checks the type
    expect(state.asm).toBe(DEFAULT_STATE.asm);
    expect(state.furn).toBe(DEFAULT_STATE.furn);
    expect(state.unit).toBe(DEFAULT_STATE.unit);
    expect(state.imports).toEqual(["coal"]);
  });

  it("reports unreadable data instead of hiding it", () => {
    const r = parseState("{not json");
    expect(r.error).toMatch(/couldn't be read/);
    expect(r.state).toEqual(DEFAULT_STATE);
  });
});
