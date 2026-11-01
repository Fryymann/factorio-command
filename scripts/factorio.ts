// Finding and running Factorio for dump-data.ts, on Windows and Linux (including NixOS).

const STEAM_FACTORIO = "steamapps/common/Factorio/bin/x64/factorio";

/**
 * Where to look for the factorio executable, first match wins. FACTORIO overrides everything:
 * on NixOS it points at a wrapper script that runs the game through steam-run (see README).
 */
export function factorioCandidates(
  platform: NodeJS.Platform,
  home: string,
  env: { FACTORIO?: string | undefined },
): string[] {
  if (env.FACTORIO) return [env.FACTORIO];
  if (platform === "win32") return [`C:/Program Files (x86)/Steam/${STEAM_FACTORIO}.exe`];
  if (platform === "linux") {
    return [
      `${home}/.local/share/Steam/${STEAM_FACTORIO}`,
      `${home}/.steam/steam/${STEAM_FACTORIO}`,
    ];
  }
  return [];
}

export interface SpawnOutcome {
  status: number | null;
  signal: NodeJS.Signals | null;
  error?: Error | undefined;
}

/**
 * Why a Factorio run failed, in words, or null if it succeeded. `exeExists` says whether the
 * executable is on disk: ENOENT for a file that exists means its #! interpreter is missing,
 * which is what happens with Steam's launcher script on NixOS.
 */
export function spawnFailure(flag: string, r: SpawnOutcome, exeExists: boolean): string | null {
  if (r.error) {
    const why = `factorio ${flag} couldn't start: ${r.error.message}`;
    const code = (r.error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" && exeExists) {
      return (
        `${why}. The file exists, so its #! interpreter may be missing; on NixOS, set FACTORIO ` +
        `to the steam-run wrapper (see README).`
      );
    }
    return why;
  }
  if (r.signal) return `factorio ${flag} was stopped by ${r.signal}`;
  if (r.status !== 0) return `factorio ${flag} failed with exit code ${String(r.status)}`;
  return null;
}
