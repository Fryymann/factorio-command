import { describe, expect, it } from "vitest";
import { createStateSaver, DEFAULT_STATE, parseState } from "./storage.ts";
import type { CalcState } from "./storage.ts";

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

// #15: the artifact saved on every render, so a failed load was followed by the defaults
// replacing the user's saved settings.
describe("createStateSaver (fcp-state)", () => {
  const LOAD_ERROR = parseState("{not json").error;

  const recorder = (result?: string) => {
    const saved: CalcState[] = [];
    const save = (s: CalcState) => {
      saved.push(structuredClone(s));
      return result;
    };
    return { saved, save };
  };

  it("writes nothing until the user changes a setting", () => {
    const { saved, save } = recorder();
    const saver = createStateSaver(save, LOAD_ERROR);
    saver.warnings();
    expect(saved).toEqual([]);
  });

  it("keeps the load error, and says the data is kept, until a save replaces the data", () => {
    const { saved, save } = recorder();
    const saver = createStateSaver(save, LOAD_ERROR);
    expect(saver.warnings()).toEqual([LOAD_ERROR]);
    expect(LOAD_ERROR).toMatch(/left as they are until you change a setting/);
    saver.changed({ ...DEFAULT_STATE, amount: "12" });
    expect(saved).toEqual([{ ...DEFAULT_STATE, amount: "12" }]);
    expect(saver.warnings()).toEqual([]);
  });

  it("shows a failed save, and keeps the load error since the old data is still there", () => {
    const { save } = recorder("Couldn't save calculator settings: QuotaExceededError");
    const saver = createStateSaver(save, LOAD_ERROR);
    saver.changed(DEFAULT_STATE);
    expect(saver.warnings()).toEqual([
      LOAD_ERROR,
      "Couldn't save calculator settings: QuotaExceededError",
    ]);
  });

  it("saves every change after the first", () => {
    const { saved, save } = recorder();
    const saver = createStateSaver(save);
    saver.changed({ ...DEFAULT_STATE, mode: "rate" });
    saver.changed({ ...DEFAULT_STATE, mode: "buildings" });
    expect(saved.map((s) => s.mode)).toEqual(["rate", "buildings"]);
    expect(saver.warnings()).toEqual([]);
  });
});
