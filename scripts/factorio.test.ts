import { describe, expect, it } from "vitest";
import { factorioCandidates, spawnFailure } from "./factorio.ts";

describe("factorioCandidates", () => {
  it("uses FACTORIO alone when it's set", () => {
    expect(factorioCandidates("linux", "/home/k", { FACTORIO: "/opt/f/factorio-nix" })).toEqual([
      "/opt/f/factorio-nix",
    ]);
  });

  it("looks in the Steam install on Windows", () => {
    expect(factorioCandidates("win32", "C:/Users/ian", {})).toEqual([
      "C:/Program Files (x86)/Steam/steamapps/common/Factorio/bin/x64/factorio.exe",
    ]);
  });

  it("looks in the Steam install on Linux, under the home folder", () => {
    expect(factorioCandidates("linux", "/home/k", {})).toEqual([
      "/home/k/.local/share/Steam/steamapps/common/Factorio/bin/x64/factorio",
      "/home/k/.steam/steam/steamapps/common/Factorio/bin/x64/factorio",
    ]);
  });

  it("has no default elsewhere", () => {
    expect(factorioCandidates("darwin", "/Users/x", {})).toEqual([]);
  });
});

describe("spawnFailure", () => {
  it("names the system error when Factorio couldn't start", () => {
    // What spawnSync returns on NixOS when the Steam wrapper's #!/bin/bash doesn't exist.
    const error = Object.assign(new Error("spawnSync /x/factorio ENOENT"), { code: "ENOENT" });
    expect(spawnFailure("--dump-data", { status: null, signal: null, error })).toBe(
      "factorio --dump-data couldn't start: spawnSync /x/factorio ENOENT",
    );
  });

  it("names the signal when Factorio was killed", () => {
    expect(spawnFailure("--dump-data", { status: null, signal: "SIGKILL" })).toBe(
      "factorio --dump-data was stopped by SIGKILL",
    );
  });

  it("gives the exit code otherwise", () => {
    expect(spawnFailure("--dump-data", { status: 1, signal: null })).toBe(
      "factorio --dump-data failed with exit code 1",
    );
  });

  it("returns null on success", () => {
    expect(spawnFailure("--dump-data", { status: 0, signal: null })).toBeNull();
  });
});
