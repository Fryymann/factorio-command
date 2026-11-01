import { describe, expect, it } from "vitest";
import { createStateSaver, DEFAULT_STATE, parseState } from "./storage.ts";
import type { CalcState } from "./storage.ts";

describe("parseState (fcp-state)", () => {
  it("returns defaults when nothing is saved", () => {
    expect(parseState(null).state).toEqual(DEFAULT_STATE);
  });

  it("migrates what the artifact wrote to entity names", () => {
    const saved = {
      item: "logistic-science-pack",
      amount: 8,
      mode: "buildings",
      asm: "1.25",
      furn: "stone",
      belt: "45",
      unit: "60",
      imports: [],
    };
    const r = parseState(JSON.stringify(saved));
    expect(r.error).toBeUndefined();
    expect(r.state).toEqual({
      ...saved,
      version: 2,
      asm: "assembling-machine-3",
      furn: "stone-furnace",
      belt: "express-transport-belt",
    });
  });

  it("keeps the rest of an artifact save as it was", () => {
    const saved = {
      item: "chemical-science-pack",
      amount: "10",
      mode: "rate",
      asm: "0.5",
      furn: "electric",
      belt: "30",
      unit: "1",
      imports: ["iron-plate"],
    };
    expect(parseState(JSON.stringify(saved)).state).toMatchObject({
      item: "chemical-science-pack",
      amount: "10",
      mode: "rate",
      unit: "1",
      imports: ["iron-plate"],
    });
  });

  it("migrates the turbo belt too", () => {
    expect(parseState(JSON.stringify({ belt: "60" })).state.belt).toBe("turbo-transport-belt");
  });

  it("loads a version 2 save unchanged and without a warning", () => {
    const saved = {
      ...DEFAULT_STATE,
      asm: "assembling-machine-1",
      furn: "electric-furnace",
      belt: "fast-transport-belt",
    };
    const r = parseState(JSON.stringify(saved));
    expect(r.error).toBeUndefined();
    expect(r.state).toEqual(saved);
  });

  it("warns about an unknown belt instead of accepting it (#16)", () => {
    const r = parseState(JSON.stringify({ belt: "99" }));
    expect(r.state.belt).toBe(DEFAULT_STATE.belt);
    expect(r.error).toMatch(/belt "99"/);
    expect(r.error).toMatch(/left as they are until you change a setting/);
  });

  it("warns about unknown machines and products, naming each", () => {
    const { state, error } = parseState(
      JSON.stringify({ item: "x", asm: "9", furn: "lava", unit: "7", imports: [1, "coal"] }),
    );
    expect(state.item).toBe(DEFAULT_STATE.item);
    expect(state.asm).toBe(DEFAULT_STATE.asm);
    expect(state.furn).toBe(DEFAULT_STATE.furn);
    expect(state.unit).toBe(DEFAULT_STATE.unit);
    expect(state.imports).toEqual(["coal"]);
    expect(error).toMatch(/product "x"/);
    expect(error).toMatch(/assembler "9"/);
    expect(error).toMatch(/furnace "lava"/);
  });

  it("doesn't guess at a save from a newer version", () => {
    const r = parseState(
      JSON.stringify({ ...DEFAULT_STATE, version: 3, belt: "fast-transport-belt" }),
    );
    expect(r.state).toEqual(DEFAULT_STATE);
    expect(r.error).toMatch(/newer version/);
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
