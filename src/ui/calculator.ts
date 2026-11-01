// Calculator tab: rendering and wiring. Ported from artifacts/FCP_v1-2.html, lines 549-652.
// Rates are per second everywhere except here: the per-minute conversion happens in `rateStr`.
import { RECIPES, isFluid, nm, short } from "../data/legacy.ts";
import { fmt } from "../data/format.ts";
import { consumption, solve } from "../solver/solve.ts";
import type { BuildRow, Plan } from "../solver/solve.ts";
import { esc, el, groupedOptions, sw } from "./common.ts";
import { planSettings } from "./planInput.ts";
import { rateStr, state, stateLoadError, unitLbl } from "./state.ts";
import { saveState } from "./storage.ts";
import type { CalcState } from "./storage.ts";

const checkTag = (id: string): string =>
  RECIPES[id]?.check
    ? ` <span class="tag" title="Compare with the in-game recipe">check</span>`
    : "";

export function mountCalculator(onSend: () => void): void {
  const importBtn = (id: string): string => {
    if (id === state.item || !RECIPES[id]) return "";
    const on = state.imports.includes(id);
    const title = on
      ? "Build this here instead"
      : "Bring this in from your bus instead of building it";
    return `<button type="button" class="pill${on ? " on" : ""}" data-imp="${esc(id)}" aria-pressed="${on}" title="${title}">${on ? "Imported" : "Import"}</button>`;
  };

  function buildRows(build: BuildRow[]): string {
    return (
      build
        .map((b) => {
          const pct = Math.min(1, b.exact / b.count);
          return `<tr>
      <td><span class="item">${sw(b.id)}${esc(nm(b.id))}${checkTag(b.id)}</span></td>
      <td class="num">${rateStr(b.rate)}</td>
      <td class="mach">${b.machine.name}</td>
      <td class="big"><span class="exact">${fmt(b.exact, 2)}</span>${b.count}<span class="util${pct > 0.999 ? " full" : ""}" title="${Math.round(pct * 100)}% busy"><i style="width:${pct * 100}%"></i></span></td>
      <td>${importBtn(b.id)}</td>
    </tr>`;
        })
        .join("") || `<tr><td colspan="5" class="empty">Nothing to build at this target.</td></tr>`
    );
  }

  function inputRows(inputs: Plan["inputs"]): string {
    const beltPerSec = Number(state.belt);
    const rows = [...inputs.entries()].sort((a, b) =>
      a[1].imported === b[1].imported ? b[1].rate - a[1].rate : a[1].imported ? -1 : 1,
    );
    return (
      rows
        .map(([id, v]) => {
          const fluid = isFluid(id);
          const lanes = v.rate / (beltPerSec / 2);
          const belts = v.rate / beltPerSec;
          return `<tr>
      <td><span class="item">${sw(id)}${esc(nm(id))}</span></td>
      <td class="num">${rateStr(v.rate)}</td>
      <td class="num">${fluid ? "pipe" : fmt(lanes, 2)}</td>
      <td class="num">${fluid ? "–" : fmt(belts, 2)}</td>
      <td>${v.imported ? importBtn(id) : ""}</td>
    </tr>`;
        })
        .join("") || `<tr><td colspan="5" class="empty">No inputs.</td></tr>`
    );
  }

  function treeRows(root: Plan["tree"]): string {
    const rows: string[] = [];
    (function walk(n: Plan["tree"], prefix: string, last: boolean, isRoot: boolean): void {
      const twig = isRoot ? "" : `<span class="twig">${prefix}${last ? "└─" : "├─"}</span>`;
      const right =
        n.leaf || !n.machine
          ? `${rateStr(n.rate)}${unitLbl()} · ${n.imported ? "imported" : "input"}`
          : `${rateStr(n.rate)}${unitLbl()} · <b>${fmt(n.count ?? 0, 2)}</b> ${n.machine.name.replace("Assembling machine", "AM")}`;
      rows.push(
        `<div class="node${n.leaf ? " leaf" : ""}"><div class="left">${twig}${sw(n.id)}<span class="name">${esc(nm(n.id))}</span>${n.imported ? ` <span class="tag imp">import</span>` : ""}</div><div class="right">${right}</div></div>`,
      );
      const childPrefix = isRoot ? "" : prefix + (last ? "   " : "│  ");
      n.children.forEach((c, i) => walk(c, childPrefix, i === n.children.length - 1, false));
    })(root, "", true, true);
    return rows.join("");
  }

  function renderPlan({ tree, build, inputs }: Plan): void {
    el("equiv").textContent =
      state.mode === "buildings"
        ? `= ${rateStr(tree.rate)} ${short(state.item)}${unitLbl()}`
        : `= ${fmt(tree.count ?? 0, 2)} buildings of ${short(state.item)}`;
    el("s-out").innerHTML = `${rateStr(tree.rate)}<small>${unitLbl()}</small>`;
    el("s-bld").innerHTML = `${build.reduce((s, b) => s + b.count, 0)}<small>total</small>`;
    el("s-iron").innerHTML =
      `${rateStr(consumption(build, "iron-plate"))}<small>${unitLbl()}</small>`;
    el("s-copper").innerHTML =
      `${rateStr(consumption(build, "copper-plate"))}<small>${unitLbl()}</small>`;
    el("build").innerHTML = buildRows(build);
    el("inputs").innerHTML = inputRows(inputs);
    el("tree").innerHTML = treeRows(tree);
  }

  /** An amount the solver can't take: blank the results rather than show numbers for a guess. */
  function renderNoPlan(): void {
    el("equiv").textContent = "";
    for (const id of ["s-out", "s-bld", "s-iron", "s-copper"]) el(id).textContent = "–";
    el("build").innerHTML = `<tr><td colspan="5" class="empty">Enter a target amount.</td></tr>`;
    el("inputs").innerHTML = `<tr><td colspan="5" class="empty">No inputs.</td></tr>`;
    el("tree").innerHTML = "";
  }

  function render(): void {
    const input = planSettings(state);
    const plan = input.ok ? solve(input.settings) : undefined;
    const warnList = input.ok ? [...(plan?.warnings ?? [])] : [input.error];
    if (stateLoadError) warnList.push(stateLoadError);
    const saveError = saveState(state);
    if (saveError) warnList.push(saveError);

    el("th-rate").textContent = unitLbl();
    el("th-rate2").textContent = unitLbl();
    el("warnings").innerHTML = warnList.map((w) => `<div class="warnbox">${esc(w)}</div>`).join("");
    if (plan) renderPlan(plan);
    else renderNoPlan();

    el<HTMLSelectElement>("item").value = state.item;
    el<HTMLInputElement>("amount").value = String(state.amount);
    el<HTMLSelectElement>("asm").value = state.asm;
    el<HTMLSelectElement>("furn").value = state.furn;
    el<HTMLSelectElement>("belt").value = state.belt;
    el<HTMLSelectElement>("unit").value = state.unit;
    el("mode-buildings").setAttribute("aria-pressed", String(state.mode === "buildings"));
    el("mode-rate").setAttribute("aria-pressed", String(state.mode === "rate"));
  }

  el("item").innerHTML = groupedOptions();

  const onChange = <K extends keyof CalcState>(id: string, key: K): void => {
    el<HTMLSelectElement>(id).addEventListener("change", (e) => {
      state[key] = (e.target as HTMLSelectElement).value as CalcState[K];
      render();
    });
  };
  onChange("item", "item");
  onChange("asm", "asm");
  onChange("furn", "furn");
  onChange("belt", "belt");
  onChange("unit", "unit");
  el<HTMLInputElement>("amount").addEventListener("input", (e) => {
    state.amount = (e.target as HTMLInputElement).value;
    render();
  });
  el("mode-buildings").addEventListener("click", () => {
    state.mode = "buildings";
    render();
  });
  el("mode-rate").addEventListener("click", () => {
    state.mode = "rate";
    render();
  });
  el("view-calc").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-imp]");
    if (!b?.dataset.imp) return;
    const id = b.dataset.imp;
    state.imports = state.imports.includes(id)
      ? state.imports.filter((x) => x !== id)
      : [...state.imports, id];
    render();
  });

  // With no valid amount there is nothing to send; render() already shows why.
  el("to-planner").addEventListener("click", () => {
    if (planSettings(state).ok) onSend();
  });

  render();
}
