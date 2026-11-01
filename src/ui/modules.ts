// Modules tab: layout bar, canvas, inspector and problems list. Ported from the "layout planner"
// section of artifacts/FCP_v1-2.html (lines 654-1212). The maths lives in src/modules/; this file
// only draws it and handles input. Saving goes through src/modules/storage.ts, which reports
// failures; if saved layouts can't be read, nothing is written so they are never overwritten.
import {
  BELT_KEY_TIERS,
  BELTS,
  beltByKey,
  isFluid,
  machine,
  plannedRecipe,
  itemName,
} from "../data/game.ts";
import { ITEM_CLASS, MACH_ENTITY, MACH_SHORT } from "../data/legacy.ts";
import type { MachineKey } from "../data/legacy.ts";
import { fmt } from "../data/format.ts";
import { simulate } from "../modules/simulate.ts";
import type { NodeResult, Simulation } from "../modules/simulate.ts";
import {
  MACH_KEYS,
  NODE_W,
  canConnect,
  defaultMach,
  duplicateLayout,
  layoutFromCalc,
  machOptions,
  newLayout,
  removeEdge,
  removeNode,
} from "../modules/fromCalc.ts";
import type { PlacedLayout, PlacedNode } from "../modules/fromCalc.ts";
import { solve } from "../solver/solve.ts";
import { PICKABLE, el, esc, groupedOptions, itemOptions, sw, swatchVar } from "./common.ts";
import { rateStr, state, unitLbl } from "./state.ts";
import { planSettings } from "./planInput.ts";
import { DEFAULT_STATE } from "./storage.ts";
import type { CalcState } from "./storage.ts";
import * as store from "./store.ts";

const PORT_Y = 19;
const GRID = 12;
const EPS = 1e-6;
const uid = (): string => Math.random().toString(36).slice(2, 10);
const snap = (x: number): number => Math.round(x / GRID) * GRID;

type Sel = { type: "node" | "edge"; id: string } | null;
type MachineNode = Extract<PlacedNode, { kind: "machine" }>;
type SourceNode = Extract<PlacedNode, { kind: "source" }>;

const RECIPE_IDS = PICKABLE.filter((id) => plannedRecipe(id));
const ALL_IDS = [...PICKABLE, ...Object.keys(ITEM_CLASS).filter((id) => !PICKABLE.includes(id))];

function nodeLabel(n: PlacedNode | undefined): string {
  if (!n) return "?";
  if (n.kind === "machine") return `${fmt(Number(n.count) || 0, 2)}× ${itemName(n.item)}`;
  if (n.kind === "source") return `${itemName(n.item)} source`;
  return "Output";
}

export interface ModulesTab {
  /** Call whenever the tab becomes visible (or the calculator units change). */
  show(): void;
  /** Add a layout built from the calculator's current chain and switch to it. */
  sendFromCalc(): void;
}

export function mountModules(onModuleBlueprint: (nodeId: string) => void): ModulesTab {
  const PL: {
    data: typeof store.data;
    sel: Sel;
    sim: Simulation | null;
    temp: { from: string; x: number; y: number } | null;
  } = { data: store.data, sel: null, sim: null, temp: null };
  const cur = store.current;
  const plSave = store.saveNow;
  const plSaveSoon = store.saveSoon;
  const addLayout = (L: PlacedLayout): void => {
    store.addLayout(L);
    PL.sel = null;
  };

  const sim = (): Simulation => {
    if (!PL.sim) throw new Error("Layout has not been simulated");
    return PL.sim;
  };
  const res = (S: Simulation, id: string): NodeResult => {
    const r = S.N[id];
    if (!r) throw new Error(`No simulation result for node ${id}`);
    return r;
  };
  const isSel = (type: string, id: string): boolean => PL.sel?.type === type && PL.sel.id === id;

  const calcLayout = (name: string, s: CalcState = state): PlacedLayout => {
    const input = planSettings(s);
    if (!input.ok) throw new Error(input.error);
    return layoutFromCalc({ plan: solve(input.settings), ...s }, name, uid);
  };

  store.onMessage((m) => {
    el("pl-warn").innerHTML = m ? `<div class="warnbox">${esc(m)}</div>` : "";
  });

  // ---------- rendering ----------
  function nodeHTML(n: PlacedNode, r: NodeResult): string {
    const cls = `bn ${n.kind}${isSel("node", n.id) ? " sel" : ""}`;
    const pos = `data-node="${n.id}" style="left:${n.x}px;top:${n.y}px"`;
    const u = unitLbl();
    if (n.kind === "machine") {
      const bad = r.starved || r.missing.length > 0;
      const util = r.maxOut > 0 ? r.A / r.maxOut : 0;
      const frac = r.maxOut > 0 ? r.T / r.maxOut : 0;
      const rows = Object.keys(r.need)
        .map((i) => {
          const shortOn = r.limits.includes(i) || r.missing.includes(i);
          const v = r.missing.includes(i)
            ? "none"
            : `${rateStr(r.recv[i] ?? 0)} / ${rateStr((r.need[i] ?? 0) * frac)}`;
          return `<div class="bn-row${shortOn ? " short" : ""}"><span class="item">${sw(i)}<span class="t">${esc(itemName(i))}</span></span><span class="v">${v}</span></div>`;
        })
        .join("");
      return `<div class="${cls}${bad ? " bad" : ""}" ${pos}>
      <div class="bn-head"><span class="item">${sw(n.item)}<span class="t">${esc(itemName(n.item))}</span></span><span class="bn-pct" title="How busy these buildings are">${Math.round(util * 100)}%</span></div>
      <div class="bn-sub"><span>${fmt(Number(n.count) || 0, 2)} × ${MACH_SHORT[n.mach]}</span></div>
      <div class="bn-sec"><span>In</span><span>got / need ${u}</span></div>${rows}
      <div class="bn-out"><span>Out</span><span class="v">${rateStr(r.A)} / ${rateStr(r.maxOut)} max</span></div>
      <span class="port in"></span><span class="port out" data-port="${n.id}" title="Drag to another block to add a belt"></span></div>`;
    }
    if (n.kind === "source") {
      const over = r.down > r.maxOut * (1 + EPS);
      return `<div class="${cls}${over ? " bad" : ""}" ${pos}>
      <div class="bn-head"><span class="item">${sw(n.item)}<span class="t">${esc(itemName(n.item))}</span></span></div>
      <div class="bn-sub"><span class="bn-kind">Source</span><span>${rateStr(r.maxOut)}${u}</span></div>
      <div class="bn-out"><span>Sending</span><span class="v">${rateStr(r.sent)} / ${rateStr(r.maxOut)}</span></div>
      <span class="port out" data-port="${n.id}" title="Drag to another block to add a belt"></span></div>`;
    }
    const rows =
      Object.entries(r.recv)
        .filter(([, v]) => v > EPS)
        .map(
          ([i, v]) =>
            `<div class="bn-row"><span class="item">${sw(i)}<span class="t">${esc(itemName(i))}</span></span><span class="v">${rateStr(v)}${u}</span></div>`,
        )
        .join("") ||
      `<div class="bn-row"><span class="t" style="color:var(--muted)">Nothing connected</span></div>`;
    return `<div class="${cls}" ${pos}>
    <div class="bn-head"><span class="item"><span class="t">Output</span></span></div>
    <div class="bn-sec"><span>Receiving</span></div>${rows}<div style="height:8px"></div>
    <span class="port in"></span></div>`;
  }

  function edgeGeom(a: PlacedNode, b: PlacedNode) {
    const x1 = a.x + NODE_W;
    const y1 = a.y + PORT_Y;
    const x2 = b.x - 4;
    const y2 = b.y + PORT_Y;
    const dx = Math.max(50, Math.abs(x2 - x1) / 2);
    return { d: `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`, x1, y1, x2, y2 };
  }

  function drawEdges(): void {
    const L = cur();
    const S = PL.sim;
    if (!S) return;
    let html = "";
    for (const e of L.edges) {
      const a = S.byId.get(e.from) as PlacedNode | undefined;
      const b = S.byId.get(e.to) as PlacedNode | undefined;
      const s = S.E[e.id];
      if (!a || !b || !s) continue;
      const g = edgeGeom(a, b);
      const col = swatchVar(s.item);
      const fluid = s.cap === Infinity;
      const label = s.unused
        ? "not used"
        : `${rateStr(s.flow)}${fluid ? "" : ` · ${Math.round((s.flow / s.cap) * 100)}%`}`;
      const mx = (g.x1 + g.x2) / 2;
      const my = (g.y1 + g.y2) / 2;
      const w = label.length * 6.9 + 16;
      html += `<g class="edge${isSel("edge", e.id) ? " sel" : ""}${s.unused || s.beltLimited ? " bad" : ""}" data-edge="${e.id}">
      <path class="hit" d="${g.d}"/><path class="line${fluid ? " fluid" : ""}" d="${g.d}" style="stroke:${col}"/>
      <path class="arrow" d="M${g.x2 - 8} ${g.y2 - 5} L${g.x2} ${g.y2} L${g.x2 - 8} ${g.y2 + 5}" style="stroke:${col}"/>
      <rect class="lbl-bg" x="${mx - w / 2}" y="${my - 10}" width="${w}" height="20"/><text class="lbl" x="${mx}" y="${my + 4}">${esc(label)}</text></g>`;
    }
    const t = PL.temp;
    const a = t ? (S.byId.get(t.from) as PlacedNode | undefined) : undefined;
    if (t && a) {
      const x1 = a.x + NODE_W;
      const y1 = a.y + PORT_Y;
      const dx = Math.max(40, Math.abs(t.x - x1) / 2);
      html += `<path class="temp" d="M${x1} ${y1} C${x1 + dx} ${y1} ${t.x - dx} ${t.y} ${t.x} ${t.y}"/>`;
    }
    el("pl-svg").innerHTML = html;
  }

  function applyView(): void {
    const v = cur().view;
    el("pl-world").style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`;
    const c = el("pl-canvas");
    c.style.backgroundSize = `${24 * v.z}px ${24 * v.z}px`;
    c.style.backgroundPosition = `${v.x}px ${v.y}px`;
    el("pl-zl").textContent = `${Math.round(v.z * 100)}%`;
  }

  function renderPlanner(): void {
    const L = cur();
    PL.sim = simulate(L);
    el("pl-nodes").innerHTML = L.nodes
      .map((n) => nodeHTML(n, res(PL.sim as Simulation, n.id)))
      .join("");
    el("pl-empty").hidden = L.nodes.length > 0;
    drawEdges();
    applyView();
    renderIssues();
    renderStats();
    plSave();
  }

  function renderLayoutBar(): void {
    el("pl-layout").innerHTML = PL.data.order
      .map((id) => `<option value="${id}">${esc(PL.data.layouts[id]?.name || "Untitled")}</option>`)
      .join("");
    el<HTMLSelectElement>("pl-layout").value = PL.data.current ?? "";
    el<HTMLInputElement>("pl-name").value = cur().name;
  }

  function renderIssues(): void {
    const L = cur();
    const S = sim();
    const u = unitLbl();
    const list: [string, string][] = [];
    if (S.cyclic) list.push(["", "This layout has a loop. Numbers inside the loop may be off."]);
    for (const n of L.nodes) {
      const r = res(S, n.id);
      const who = nodeLabel(n);
      if (n.kind === "machine") {
        r.missing.forEach((i) =>
          list.push([`node:${n.id}`, `${who} has no ${itemName(i)} connected.`]),
        );
        if (r.starved && r.limits.length) {
          const frac = r.maxOut ? r.T / r.maxOut : 0;
          const parts = r.limits
            .filter((i) => !r.missing.includes(i))
            .map(
              (i) =>
                `${itemName(i)} ${rateStr(r.recv[i] ?? 0)} of ${rateStr((r.need[i] ?? 0) * frac)}${u}`,
            );
          if (parts.length)
            list.push([
              `node:${n.id}`,
              `${who} is short: ${parts.join(", ")}. Running at ${Math.round((r.A / r.maxOut) * 100)}%.`,
            ]);
        }
        if (r.down > r.maxOut * (1 + EPS) && r.maxOut > 0) {
          const needN = Math.ceil(((Number(n.count) || 0) * r.down) / r.maxOut - EPS);
          list.push([
            `node:${n.id}`,
            `${who} can't keep up: downstream wants ${rateStr(r.down)}${u}, max is ${rateStr(r.maxOut)}${u}. Needs ${needN} buildings.`,
          ]);
        }
      } else if (n.kind === "source" && r.down > r.maxOut * (1 + EPS)) {
        list.push([
          `node:${n.id}`,
          `${who} gives ${rateStr(r.maxOut)}${u} but the chain wants ${rateStr(r.down)}${u}.`,
        ]);
      }
    }
    for (const e of L.edges) {
      const s = S.E[e.id];
      if (!s) continue;
      const a = nodeLabel(S.byId.get(e.from) as PlacedNode | undefined);
      const b = nodeLabel(S.byId.get(e.to) as PlacedNode | undefined);
      const item = s.item ? itemName(s.item) : "?";
      if (s.unused)
        list.push([
          `edge:${e.id}`,
          `${b} doesn't use ${item}, so the belt from ${a} carries nothing.`,
        ]);
      else if (s.beltLimited) {
        const key = String(e.belt);
        const tier = ["15", "30", "45", "60"].includes(key)
          ? beltByKey(key).name
          : (BELTS[key]?.name ?? "belt");
        list.push([
          `edge:${e.id}`,
          `Belt ${a} → ${b} is full: it needs ${rateStr(s.wanted)}${u}, a ${tier} carries ${rateStr(s.cap)}${u}. Use a faster belt or add a second one.`,
        ]);
      }
    }
    el("pl-issues").innerHTML = list.length
      ? list
          .map(([ref, t]) => `<li><button type="button" data-ref="${ref}">${esc(t)}</button></li>`)
          .join("")
      : `<li class="clear">No problems. Every block gets what it needs.</li>`;
    const bld: Record<string, number> = {};
    for (const n of L.nodes) {
      if (n.kind !== "machine") continue;
      const k = machine(MACH_ENTITY[n.mach]).name;
      bld[k] = (bld[k] ?? 0) + (Number(n.count) || 0);
    }
    el("pl-totals").innerHTML = Object.entries(bld)
      .map(([k, v]) => `<span>${esc(k)} <b>${fmt(v, 2)}</b></span>`)
      .join("");
  }

  // ---------- inspector ----------
  const selNode = (): PlacedNode | undefined =>
    PL.sel?.type === "node" ? cur().nodes.find((x) => x.id === PL.sel?.id) : undefined;
  const selEdge = () =>
    PL.sel?.type === "edge" ? cur().edges.find((x) => x.id === PL.sel?.id) : undefined;
  const val = (ev: Event): string => (ev.target as HTMLInputElement | HTMLSelectElement).value;

  function renderInspector(): void {
    const box = el("pl-insp");
    const n = selNode();
    const e = selEdge();
    if (n?.kind === "machine") {
      const m: MachineNode = n;
      box.innerHTML = `<h3>${sw(m.item)}Machine block</h3>
      <div class="field"><label for="pf-item">Makes</label><select id="pf-item">${itemOptions(RECIPE_IDS, m.item)}</select></div>
      <div class="field"><label for="pf-count">Buildings</label><input id="pf-count" type="number" min="0" step="1" value="${m.count}"></div>
      <div class="field"><label for="pf-mach">Building type</label><select id="pf-mach">${machOptions(
        m.item,
      )
        .map(
          (k) =>
            `<option value="${k}"${k === m.mach ? " selected" : ""}>${machine(MACH_ENTITY[k]).name}</option>`,
        )
        .join("")}</select></div>
      <div class="stats" id="pl-stats"></div>
      <div class="btns"><button type="button" class="btn primary" data-act="bp">Module blueprint</button><button type="button" class="btn" data-act="delete">Delete block</button></div>`;
      el("pf-item").addEventListener("change", (ev) => {
        m.item = val(ev);
        if (!machOptions(m.item).includes(m.mach)) m.mach = defaultMach(m.item, state);
        renderInspector();
        renderPlanner();
      });
      el("pf-count").addEventListener("input", (ev) => {
        m.count = Math.max(0, Number(val(ev)) || 0);
        renderPlanner();
      });
      el("pf-mach").addEventListener("change", (ev) => {
        m.mach = val(ev) as MachineKey;
        renderPlanner();
      });
    } else if (n?.kind === "source") {
      const s: SourceNode = n;
      box.innerHTML = `<h3>${sw(s.item)}Source block</h3>
      <div class="field"><label for="pf-item">Item</label><select id="pf-item">${itemOptions(ALL_IDS, s.item)}</select></div>
      <div class="field"><label for="pf-rate">Supplies (${unitLbl()})</label><input id="pf-rate" type="number" min="0" step="any" value="${+(Number(s.rate) * Number(state.unit)).toFixed(3)}"></div>
      <div class="stats" id="pl-stats"></div>
      <div class="btns"><button type="button" class="btn" data-act="delete">Delete block</button></div>`;
      el("pf-item").addEventListener("change", (ev) => {
        s.item = val(ev);
        renderInspector();
        renderPlanner();
      });
      el("pf-rate").addEventListener("input", (ev) => {
        s.rate = Math.max(0, Number(val(ev)) || 0) / Number(state.unit);
        renderPlanner();
      });
    } else if (n) {
      box.innerHTML = `<h3>Output block</h3><p class="help">Collects finished products, like a chest or the belt to your labs. It accepts as much as the belts bring.</p>
      <div class="stats" id="pl-stats"></div>
      <div class="btns"><button type="button" class="btn" data-act="delete">Delete block</button></div>`;
    } else if (e) {
      const s = sim().E[e.id];
      const fluid = !!s && s.cap === Infinity;
      box.innerHTML = `<h3>${s ? sw(s.item) : ""}${fluid ? "Pipe" : "Belt"}</h3>
      ${
        fluid
          ? `<p class="help">Fluids go by pipe. Pipe throughput isn't limited here.</p>`
          : `<div class="field"><label for="pf-belt">Belt type</label><select id="pf-belt">${BELT_KEY_TIERS()
              .map(
                ([k, v]) =>
                  `<option value="${k}"${k === String(e.belt) ? " selected" : ""}>${v.name} (${fmt(v.itemsPerSecond * Number(state.unit))}${unitLbl()})</option>`,
              )
              .join("")}</select></div>`
      }
      <div class="stats" id="pl-stats"></div>
      <div class="btns"><button type="button" class="btn" data-act="delete">Delete ${fluid ? "pipe" : "belt"}</button></div>`;
      if (!fluid)
        el("pf-belt").addEventListener("change", (ev) => {
          e.belt = val(ev);
          renderPlanner();
        });
    } else {
      box.innerHTML = `<h3>How to use</h3><div class="help"><ul>
      <li><b>Add blocks</b> with the bar above. A machine block is a group of buildings making one item. A source is something you bring in, like a plate belt from your bus.</li>
      <li><b>Connect</b> by dragging from the amber dot on a block's right edge to another block.</li>
      <li><b>Move</b> blocks by their title bar. Drag empty space to pan; scroll or use the buttons to zoom.</li>
      <li><b>Click</b> a block or belt to edit it here. Delete removes it.</li>
      <li>Belt labels show items per ${state.unit === "60" ? "minute" : "second"} and how full the belt is (both lanes). Red means a problem.</li>
    </ul></div>`;
    }
    renderStats();
  }

  function renderStats(): void {
    const box = document.getElementById("pl-stats");
    const S = PL.sim;
    const sel = PL.sel;
    if (!box || !S || !sel) return;
    const u = unitLbl();
    const kv = (k: string, v: string, warn?: boolean): string =>
      `<div class="kv${warn ? " warn" : ""}"><span>${k}</span><span>${v}</span></div>`;
    if (sel.type === "node") {
      const n = selNode();
      if (!n) return;
      const r = res(S, n.id);
      if (n.kind === "machine") {
        let h =
          kv("Busy", `${r.maxOut ? Math.round((r.A / r.maxOut) * 100) : 0}%`, r.starved) +
          kv("Making", `${rateStr(r.A)}${u}`) +
          kv("Max with this many", `${rateStr(r.maxOut)}${u}`);
        if (S.outE.get(n.id)?.length) {
          h += kv("Downstream wants", `${rateStr(r.down)}${u}`, r.down > r.maxOut * (1 + EPS));
          const per = r.maxOut / (Number(n.count) || 1);
          if (per > 0 && r.down > 0) {
            const needN = Math.ceil(r.down / per - EPS);
            if (needN !== Number(n.count))
              h += `<div class="suggest"><span>${fmt(r.down / per, 2)} buildings would match demand</span><button type="button" class="btn small" data-act="setcount" data-v="${needN}">Use ${needN}</button></div>`;
          }
        } else h += kv("Output belt", "not connected");
        box.innerHTML = h;
      } else if (n.kind === "source") {
        let h =
          kv("Sending", `${rateStr(r.sent)}${u}`) +
          kv("Chain wants", `${rateStr(r.down)}${u}`, r.down > r.maxOut * (1 + EPS)) +
          kv("Spare", `${rateStr(Math.max(0, r.maxOut - r.sent))}${u}`);
        if (r.down > EPS && Math.abs(r.down - r.maxOut) > EPS * Math.max(1, r.down))
          h += `<div class="suggest"><span>Match what the chain wants</span><button type="button" class="btn small" data-act="setrate" data-v="${r.down}">Use ${rateStr(r.down)}</button></div>`;
        box.innerHTML = h;
      } else {
        box.innerHTML =
          Object.entries(r.recv)
            .filter(([, v]) => v > EPS)
            .map(([i, v]) => kv(esc(itemName(i)), `${rateStr(v)}${u}`))
            .join("") || kv("Receiving", "nothing yet");
      }
    } else {
      const e = selEdge();
      const s = S.E[sel.id];
      if (!e || !s) return;
      let h =
        kv("From", esc(nodeLabel(S.byId.get(e.from) as PlacedNode | undefined))) +
        kv("To", esc(nodeLabel(S.byId.get(e.to) as PlacedNode | undefined))) +
        kv("Carrying", s.unused ? "nothing (not used)" : `${rateStr(s.flow)}${u}`, s.unused);
      if (s.cap !== Infinity) {
        h +=
          kv("Belt capacity", `${rateStr(s.cap)}${u}`) +
          kv("Full", `${Math.round((s.flow / s.cap) * 100)}%`, s.beltLimited) +
          kv("Lanes used", fmt(s.flow / (s.cap / 2), 2));
        if (s.beltLimited) h += kv("Needs", `${rateStr(s.wanted)}${u}`, true);
      }
      box.innerHTML = h;
    }
  }

  function select(s: Sel): void {
    PL.sel = s;
    document
      .querySelectorAll<HTMLElement>("#pl-nodes .bn")
      .forEach((n) => n.classList.toggle("sel", isSel("node", n.dataset.node ?? "")));
    drawEdges();
    renderInspector();
  }
  function deleteSel(): void {
    const L = cur();
    const s = PL.sel;
    if (!s) return;
    if (s.type === "node") removeNode(L, s.id);
    else removeEdge(L, s.id);
    PL.sel = null;
    renderPlanner();
    renderInspector();
  }

  // ---------- view helpers ----------
  const canvas = el("pl-canvas");
  function toWorld(ev: PointerEvent): { x: number; y: number } {
    const r = canvas.getBoundingClientRect();
    const v = cur().view;
    return { x: (ev.clientX - r.left - v.x) / v.z, y: (ev.clientY - r.top - v.y) / v.z };
  }
  function zoomAt(sx: number, sy: number, k: number): void {
    const v = cur().view;
    const z = Math.min(2, Math.max(0.2, v.z * k));
    const wx = (sx - v.x) / v.z;
    const wy = (sy - v.y) / v.z;
    v.z = z;
    v.x = sx - wx * z;
    v.y = sy - wy * z;
    applyView();
    plSaveSoon();
  }
  const zoomCenter = (k: number): void =>
    zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, k);
  function fitView(): void {
    const L = cur();
    const v = L.view;
    if (!L.nodes.length || !canvas.clientWidth) {
      v.x = 40;
      v.y = 40;
      v.z = 1;
      applyView();
      return;
    }
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const n of L.nodes) {
      const h = document.querySelector<HTMLElement>(`[data-node="${n.id}"]`)?.offsetHeight ?? 120;
      x0 = Math.min(x0, n.x);
      y0 = Math.min(y0, n.y);
      x1 = Math.max(x1, n.x + NODE_W);
      y1 = Math.max(y1, n.y + h);
    }
    const pad = 40;
    const z = Math.min(
      1.2,
      Math.max(
        0.6,
        Math.min(
          (canvas.clientWidth - pad * 2) / (x1 - x0),
          (canvas.clientHeight - pad * 2) / (y1 - y0),
        ),
      ),
    );
    v.z = z;
    v.x = Math.max(pad, (canvas.clientWidth - (x1 - x0) * z) / 2) - x0 * z;
    v.y = Math.max(pad, (canvas.clientHeight - (y1 - y0) * z) / 2) - y0 * z;
    applyView();
    plSave();
  }

  // ---------- canvas interaction ----------
  type Drag =
    | { type: "connect"; from: string }
    | {
        type: "node";
        n: PlacedNode;
        el: HTMLElement;
        ox: number;
        oy: number;
        sx: number;
        sy: number;
        moved: boolean;
      }
    | { type: "pan"; sx: number; sy: number; vx: number; vy: number; moved: boolean };
  let drag: Drag | null = null;
  const closest = (ev: Event, sel: string): HTMLElement | null =>
    (ev.target as HTMLElement).closest<HTMLElement>(sel);

  canvas.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0 || closest(ev, ".pl-zoom")) return;
    const L = cur();
    const pt = toWorld(ev);
    const port = closest(ev, ".port.out");
    const nodeEl = closest(ev, "[data-node]");
    const edgeEl = closest(ev, "[data-edge]");
    if (port?.dataset.port) {
      drag = { type: "connect", from: port.dataset.port };
      PL.temp = { from: port.dataset.port, x: pt.x, y: pt.y };
    } else if (nodeEl) {
      const n = L.nodes.find((x) => x.id === nodeEl.dataset.node);
      if (!n) return;
      drag = {
        type: "node",
        n,
        el: nodeEl,
        ox: pt.x - n.x,
        oy: pt.y - n.y,
        sx: ev.clientX,
        sy: ev.clientY,
        moved: false,
      };
      if (!isSel("node", n.id)) select({ type: "node", id: n.id });
    } else if (edgeEl?.dataset.edge) {
      select({ type: "edge", id: edgeEl.dataset.edge });
      return;
    } else {
      drag = {
        type: "pan",
        sx: ev.clientX,
        sy: ev.clientY,
        vx: L.view.x,
        vy: L.view.y,
        moved: false,
      };
      canvas.classList.add("panning");
    }
    canvas.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    const pt = toWorld(ev);
    if (drag.type === "connect" && PL.temp) {
      PL.temp.x = pt.x;
      PL.temp.y = pt.y;
      drawEdges();
    } else if (drag.type === "node") {
      if (!drag.moved && Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) < 3) return;
      drag.moved = true;
      drag.n.x = snap(pt.x - drag.ox);
      drag.n.y = snap(pt.y - drag.oy);
      drag.el.style.left = `${drag.n.x}px`;
      drag.el.style.top = `${drag.n.y}px`;
      drawEdges();
    } else if (drag.type === "pan") {
      const v = cur().view;
      const dx = ev.clientX - drag.sx;
      const dy = ev.clientY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      v.x = drag.vx + dx;
      v.y = drag.vy + dy;
      applyView();
    }
  });
  canvas.addEventListener("pointerup", (ev) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    canvas.classList.remove("panning");
    if (d.type === "connect") {
      PL.temp = null;
      const hit = document.elementFromPoint(ev.clientX, ev.clientY);
      const toId = hit?.closest<HTMLElement>("[data-node]")?.dataset.node;
      const L = cur();
      if (toId && canConnect(L, d.from, toId)) {
        const e = { id: uid(), from: d.from, to: toId, belt: state.belt };
        L.edges.push(e);
        PL.sel = { type: "edge", id: e.id };
        renderPlanner();
        renderInspector();
      } else drawEdges();
    } else if (d.type === "node") {
      if (d.moved) plSave();
    } else if (!d.moved) select(null);
    else plSaveSoon();
  });
  canvas.addEventListener("pointercancel", () => {
    PL.temp = null;
    drag = null;
    canvas.classList.remove("panning");
    drawEdges();
  });
  canvas.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      const r = canvas.getBoundingClientRect();
      zoomAt(ev.clientX - r.left, ev.clientY - r.top, Math.exp(-ev.deltaY * 0.0015));
    },
    { passive: false },
  );
  el("pl-zin").addEventListener("click", () => zoomCenter(1.2));
  el("pl-zout").addEventListener("click", () => zoomCenter(1 / 1.2));
  el("pl-fit").addEventListener("click", fitView);

  el("pl-insp").addEventListener("click", (ev) => {
    const b = closest(ev, "[data-act]");
    if (!b) return;
    const n = selNode();
    const v = Number(b.dataset.v);
    if (b.dataset.act === "delete") deleteSel();
    else if (b.dataset.act === "bp" && n?.kind === "machine") onModuleBlueprint(n.id);
    else if (b.dataset.act === "setcount" && n?.kind === "machine") {
      n.count = v;
      renderInspector();
      renderPlanner();
    } else if (b.dataset.act === "setrate" && n?.kind === "source") {
      n.rate = v;
      renderInspector();
      renderPlanner();
    }
  });
  el("pl-issues").addEventListener("click", (ev) => {
    const ref = closest(ev, "[data-ref]")?.dataset.ref;
    if (!ref) return;
    const [type, id] = ref.split(":");
    if ((type === "node" || type === "edge") && id) select({ type, id });
    canvas.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
  document.addEventListener("keydown", (ev) => {
    if (el("view-plan").hidden || (ev.target as HTMLElement).closest("input, select, textarea"))
      return;
    if ((ev.key === "Delete" || ev.key === "Backspace") && PL.sel) {
      ev.preventDefault();
      deleteSel();
    } else if (ev.key === "Escape") select(null);
  });

  // ---------- toolbar ----------
  const addItem = el<HTMLSelectElement>("pl-add-item");
  addItem.innerHTML = `${groupedOptions()}<optgroup label="Raw and fluids">${itemOptions(
    Object.keys(ITEM_CLASS).filter((id) => !PICKABLE.includes(id)),
  )}</optgroup>`;
  const syncAddBtns = (): void => {
    el<HTMLButtonElement>("pl-add-machine").disabled = !plannedRecipe(addItem.value);
  };
  addItem.addEventListener("change", syncAddBtns);
  syncAddBtns();

  function addNode(n: Omit<PlacedNode, "id" | "x" | "y"> & Partial<PlacedNode>): void {
    const L = cur();
    const v = L.view;
    const k = L.nodes.length % 6;
    const placed = {
      ...n,
      id: uid(),
      x: snap((canvas.clientWidth / 2 - v.x) / v.z - NODE_W / 2 + k * 24),
      y: snap((canvas.clientHeight / 2 - v.y) / v.z - 60 + k * 24),
    } as PlacedNode;
    L.nodes.push(placed);
    PL.sel = { type: "node", id: placed.id };
    renderPlanner();
    renderInspector();
  }
  el("pl-add-machine").addEventListener("click", () => {
    const item = addItem.value;
    if (plannedRecipe(item))
      addNode({ kind: "machine", item, count: 1, mach: defaultMach(item, state) });
  });
  el("pl-add-source").addEventListener("click", () =>
    addNode({ kind: "source", item: addItem.value, rate: 15 / 2 }),
  );
  el("pl-add-output").addEventListener("click", () => addNode({ kind: "output", item: null }));

  function showLayout(): void {
    renderPlanner();
    renderInspector();
    const L = cur();
    if (L.needsFit && !el("view-plan").hidden) {
      fitView();
      delete L.needsFit;
      plSave();
    }
  }
  function switchLayout(id: string): void {
    PL.data.current = id;
    PL.sel = null;
    renderLayoutBar();
    showLayout();
  }
  el("pl-layout").addEventListener("change", (ev) => switchLayout(val(ev)));
  el("pl-name").addEventListener("input", (ev) => {
    cur().name = val(ev);
    const opt = el("pl-layout").querySelector(`option[value="${PL.data.current}"]`);
    if (opt) opt.textContent = val(ev) || "Untitled";
    plSaveSoon();
  });
  el("pl-new").addEventListener("click", () => {
    addLayout(newLayout(uid(), `Layout ${PL.data.order.length + 1}`));
    renderLayoutBar();
    showLayout();
    el<HTMLInputElement>("pl-name").select();
  });
  el("pl-dup").addEventListener("click", () => {
    addLayout(duplicateLayout(cur(), uid));
    renderLayoutBar();
    showLayout();
  });
  const delBtn = el("pl-del");
  let delArmed: ReturnType<typeof setTimeout> | null = null;
  const disarm = (): void => {
    if (delArmed) clearTimeout(delArmed);
    delArmed = null;
    delBtn.classList.remove("armed");
    delBtn.textContent = "Delete";
  };
  delBtn.addEventListener("click", () => {
    if (!delArmed) {
      delBtn.classList.add("armed");
      delBtn.textContent = "Confirm delete";
      delArmed = setTimeout(disarm, 4000);
      return;
    }
    disarm();
    const id = PL.data.current;
    if (!id) return;
    delete PL.data.layouts[id];
    PL.data.order = PL.data.order.filter((x) => x !== id);
    if (!PL.data.order.length) addLayout(newLayout(uid(), "Layout 1"));
    PL.data.current = PL.data.order[0] ?? null;
    PL.sel = null;
    renderLayoutBar();
    showLayout();
  });

  // The example follows the calculator, unless its amount is unusable (blank, say): then it is
  // built from the default settings and named after their item, so the label stays true.
  store.loadStore(() => {
    const s = planSettings(state).ok ? state : DEFAULT_STATE;
    return calcLayout(`Example: ${itemName(s.item)}`, s);
  });
  renderLayoutBar();
  renderPlanner();
  renderInspector();

  return {
    show(): void {
      renderLayoutBar();
      showLayout();
    },
    sendFromCalc(): void {
      const label =
        state.mode === "buildings" ? `${state.amount} buildings` : `${state.amount}/min`;
      addLayout(calcLayout(`${itemName(state.item)} · ${label}`));
      renderLayoutBar();
    },
  };
}
