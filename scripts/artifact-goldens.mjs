// Regenerates src/testdata/artifact-goldens.json by running the frozen artifact's own code
// (artifacts/FCP_v1-2.html) in a Node vm for two reference chains. The port's tests compare
// against that file, so "pinned behaviour" means "what the artifact does". Only run this if the
// artifact or the reference chains change; review the diff of the JSON like any other number.
// One input isn't the artifact's: its recipes get the game's ingredient order (#31), because
// that order decides where bus columns and Modules blocks go. Everything else is its own code.
//   node scripts/artifact-goldens.mjs
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
const lines = fs
  .readFileSync(new URL("../artifacts/FCP_v1-2.html", import.meta.url), "utf8")
  .split("\n");
const R = (a, b) => lines.slice(a - 1, b).join("\n");
const { recipes } = JSON.parse(
  fs.readFileSync(new URL("../data/game-data.json", import.meta.url), "utf8"),
);
const gameOrder = Object.fromEntries(
  Object.entries(recipes).map(([id, r]) => [id, Object.keys(r.ingredients)]),
);
// Keeps the artifact's amounts; only the order changes. Throws if the recipes no longer line up.
const useGameOrder = `
for (const [id, r] of Object.entries(RECIPES)) {
  const order = (${JSON.stringify(gameOrder)})[id];
  if (!order || order.length !== Object.keys(r.ins).length || !order.every((k) => k in r.ins))
    throw new Error("Ingredients of " + id + " differ from the game data");
  r.ins = Object.fromEntries(order.map((k) => [k, r.ins[k]]));
}`;
const out = {};
const cases = {
  green: { item: "logistic-science-pack", amount: 8, imports: ["iron-plate", "copper-plate"] },
  blue: {
    item: "chemical-science-pack",
    amount: 10,
    imports: ["iron-plate", "copper-plate", "steel-plate"],
  },
};
const canon = (v) =>
  JSON.stringify(v, (k, x) =>
    k === "tok"
      ? undefined
      : x &&
          typeof x === "object" &&
          !Array.isArray(x) &&
          !(x instanceof Map) &&
          !(x instanceof Set)
        ? Object.fromEntries(
            Object.keys(x)
              .sort()
              .map((kk) => [kk, x[kk]]),
          )
        : x,
  );
for (const [name, c] of Object.entries(cases)) {
  const code = [
    "let __n=0; const uidc=()=> 'n'+(__n++);",
    R(428, 548)
      .replace("const state = { item", "var state = { item")
      .replace(/try \{ Object\.assign\(state, JSON\.parse\(localStorage[^\n]*\n/, "\n")
      .replace(/const save = [^\n]*\n/, "\n"),
    useGameOrder,
    R(551, 551),
    R(555, 556),
    R(654, 821).replace(
      "const uid = () => Math.random().toString(36).slice(2, 10);",
      "const uid = uidc;",
    ),
    R(1214, 1473),
    R(2136, 2150),
    R(1729, 1852)
      .replace(/^const ED = .*$/m, "const ED = {};")
      .replace(/^const edActive.*$/m, ""),
    `
    Object.assign(state, ${JSON.stringify({ item: c.item, amount: c.amount, imports: c.imports, mode: "buildings", asm: "0.75", furn: "steel", belt: "15" })});
    const L0 = layoutFromCalc("T"); PL.layouts[L0.id]=L0; PL.current=L0.id;
    const sol = bpSolution(); const bp = bpSettings();
    const LY = planLayout(sol, bp);
    const ed = edFromLayout(LY, bp);
    const sim = laneSim(ed.ents, BELT_TIERS[bp.belt].U);
    const bpo = blueprintObject(LY, sol.icon, sol.label);
    ({ L0, sol, LY, ed, sim, bpo });
    `,
  ].join("\n");
  const ctx = vm.createContext({
    console,
    localStorage: { getItem: () => null, setItem() {} },
    Math,
    JSON,
    Map,
    Set,
    Number,
    String,
    Object,
    Array,
    isFinite,
  });
  const r = vm.runInContext(code, ctx);
  const h = (v) => crypto.createHash("sha256").update(canon(v)).digest("hex").slice(0, 16);
  const graph = { name: r.L0.name, nodes: r.L0.nodes, edges: r.L0.edges };
  const LY = r.LY;
  out[name] = {
    graph,
    solBuild: r.sol.build.map((b) => ({
      id: b.id,
      rate: b.rate,
      depth: b.depth,
      exact: b.exact,
      count: b.count,
      mach: b.mach,
    })),
    solInputs: [...r.sol.inputs].map(([k, v]) => [k, v.rate]),
    solMeta: { title: r.sol.title, icon: r.sol.icon, label: r.sol.label, warn: r.sol.warn },
    layout: {
      W: LY.W,
      H: LY.H,
      xb: LY.xb,
      jxA: LY.jxA,
      rowX0: LY.rowX0,
      warn: LY.warn,
      conflicts: LY.conflicts,
      counts: LY.counts,
      pairs: LY.pairs.length,
      cols: LY.cols.map((c) => [c.item, c.x, c.raw, c.rate, c.end]),
      rows: LY.rows.map((r) => [r.id, r.n, r.part, r.parts, r.T, r.bottom, r.rowWarn]),
      entsHash: h(LY.ents.map(({ ...e }) => e)),
      nEnts: LY.ents.length,
    },
    ed: {
      n: r.ed.ents.length,
      hash: h(r.ed.ents),
      feeds: r.ed.ents.filter((e) => e.feed).map((e) => [e.x, e.y, e.feed]),
    },
    lane: {
      checks: r.sim.checks.map((c) => [c.x ?? null, c.y ?? null, c.text]),
      mixed: r.sim.mixedSet.size,
      pairs: r.sim.pair.size / 2,
    },
    bpoHash: h(r.bpo),
    bpoN: r.bpo.blueprint.entities.length,
  };
  // edited exporter
  const ctx2 = ctx;
  const eo = vm.runInContext(
    `edBlueprintObject(ed.ents, BELT_TIERS[bp.belt], sol.icon, sol.label + " (edited)")`,
    ctx2,
  );
  out[name].edBpoHash = h(eo);
  out[name].edBpoLabel = eo.blueprint.label;
}
fs.writeFileSync(
  process.argv[2] ?? new URL("../src/testdata/artifact-goldens.json", import.meta.url),
  JSON.stringify(out, null, 1),
);
console.log(
  Object.entries(out)
    .map(
      ([k, v]) =>
        k +
        " ents=" +
        v.layout.nEnts +
        " " +
        JSON.stringify(v.layout.counts) +
        " checks=" +
        v.lane.checks.length +
        " warn=" +
        v.layout.warn.length +
        " conf=" +
        v.layout.conflicts,
    )
    .join("\n"),
);
