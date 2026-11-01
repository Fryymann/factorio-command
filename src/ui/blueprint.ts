// Blueprint tab: settings bar, generated layout, editor, and "Copy blueprint". Ported from
// artifacts/FCP_v1-2.html (lines 1474-1728 and 1730-2150). The layout, lane simulation, edit
// actions and export are in src/blueprint/ and src/editor/; this file draws them and handles
// input. It edits a single module or the whole chain (src/editor/chainEdit.ts).
import { bpSolution, resolveBpSettings } from "../blueprint/fromModules.ts";
import type { BpSettings, Solution } from "../blueprint/fromModules.ts";
import { blueprintObject } from "../blueprint/export.ts";
import { encodeBlueprint } from "../blueprint/encode.ts";
import { planLayout } from "../blueprint/layout.ts";
import type { Layout, LayoutEnt } from "../blueprint/layout.ts";
import { BELT_TIERS, INS_KINDS, ITEMS, MACH, isFluid, nm, short } from "../data/legacy.ts";
import { fmt } from "../data/format.ts";
import * as actions from "../editor/actions.ts";
import type { EditSession, Tool } from "../editor/actions.ts";
import { annotate, groupChecks } from "../editor/annotations.ts";
import type { Annotations } from "../editor/annotations.ts";
import { staleWarnings, startChainEdit } from "../editor/chainEdit.ts";
import { edFromLayout } from "../editor/fromLayout.ts";
import { DV, ROT_CCW, ROT_CW, foot, tkey } from "../editor/geometry.ts";
import { canMoveGroup, deleteGroup, selectInBox } from "../editor/selection.ts";
import type { TileBox } from "../editor/selection.ts";
import type { Dir, EdEnt, EditDoc, InsKind } from "../editor/types.ts";
import type { PlacedLayout } from "../modules/fromCalc.ts";
import { esc, el, sw } from "./common.ts";
import {
  BELT_TOK,
  INS_TOK,
  PAD_RIGHT,
  PAD_TOP,
  TS,
  drawEditor,
  drawGenerated,
  drawNothing,
  getVar,
  itemColorFn,
} from "./blueprintDraw.ts";
import type { BpView, Paint } from "./blueprintDraw.ts";
import { rateStr, state, unitLbl } from "./state.ts";
import * as store from "./store.ts";

const ARROW: Record<Dir, string> = { N: "↑", E: "→", S: "↓", W: "←" };
const DIRNAME: Record<Dir, string> = { N: "north", E: "east", S: "south", W: "west" };
const TOOLS: Tool[] = ["select", "belt", "ug", "ins", "pole", "feed", "erase"];
const TOOL_HINT: Record<Tool, string> = {
  select:
    "Drag a piece to move it, machines included. Shift+drag selects several. Drag empty space to pan. R rotates the selected piece; Delete removes it.",
  belt: "Click to place, or drag to draw a line. The belt follows your drag direction. R rotates before placing.",
  ug: "Click the entrance, then the exit further along in the same direction. Max gap depends on belt tier.",
  ins: "Click to place. The arrow points where it drops. Click an existing inserter to re-aim it.",
  pole: "Click to place a small electric pole.",
  feed: "Click a belt to mark where an item enters, on both lanes. Click again to clear it.",
  erase: "Click or drag to remove belts, inserters and poles. Machines can only be moved.",
};

export interface BlueprintTab {
  /** Call whenever the tab becomes visible. */
  show(): void;
  /** Show one module of the current layout on its own. */
  openModule(nodeId: string): void;
}

interface Current {
  sol: Solution;
  lay: Layout;
  /** "chain", or the node id when a single module is shown. */
  editKey: string;
  /** The saved edit, when there is one. Its `ents` follow the session's. */
  doc: EditDoc | null;
  session: EditSession | null;
}

type Drag =
  | { type: "pan"; x: number; y: number; vx: number; vy: number }
  | { type: "move"; ents: EdEnt[]; ox: number; oy: number; dx: number; dy: number }
  | { type: "belt"; last: { x: number; y: number } }
  | { type: "erase" }
  | { type: "click" }
  | { type: "box"; from: { x: number; y: number } };

export function mountBlueprint(): BlueprintTab {
  const cur = store.current;
  const cv = el<HTMLCanvasElement>("cv");
  const vp = el("vp");
  const tip = el("tip");
  const view: BpView = { z: 1, x: 0, y: 0, fitted: false };
  let BP: Current | null = null;
  let lightness = "62%";
  let itemColor = itemColorFn(lightness);

  const ED = {
    tool: "select" as Tool,
    dir: "E" as Dir,
    insKind: "fast" as InsKind,
    feed: "iron-plate",
    sel: [] as EdEnt[],
    hover: null as { x: number; y: number } | null,
    drag: null as Drag | null,
    box: null as TileBox | null,
    notes: null as Annotations | null,
  };
  const session = (): EditSession | null => BP?.session ?? null;

  function bpSettings(): BpSettings {
    const L = cur();
    const bp = resolveBpSettings(L.bp, state.belt);
    L.bp = bp;
    return bp;
  }
  const tierOf = (bp: BpSettings) => {
    const t = BELT_TIERS[bp.belt];
    if (!t) throw new Error(`Unknown belt tier "${bp.belt}"`);
    return t;
  };

  let warnings: string[] = [];
  let staleButtons = false;
  function renderWarnings(): void {
    const msg = store.saveMessage();
    const all = msg ? [...warnings, msg] : warnings;
    el("bp-warn").innerHTML = [...new Set(all)]
      .map(
        (t) =>
          `<div class="warnbox">${esc(t)}${staleButtons && t !== msg ? ` <button type="button" class="btn small" data-act="discard">Discard edits</button>` : ""}</div>`,
      )
      .join("");
  }

  store.onMessage(() => renderWarnings());

  // ---------- render ----------
  function renderScope(): void {
    const L = cur();
    const bp = bpSettings();
    const ms = L.nodes.filter((n) => n.kind === "machine");
    el("bp-scope").innerHTML =
      `<option value="all">Whole chain (main bus)</option>` +
      (ms.length
        ? `<optgroup label="Single module">${ms
            .map(
              (n) =>
                `<option value="${n.id}">${esc(n.kind === "machine" ? `${fmt(Number(n.count) || 0, 2)}× ${short(n.item)}` : "")} · ${MACH[n.kind === "machine" ? n.mach : "am2"].short}</option>`,
            )
            .join("")}</optgroup>`
        : "");
    if (bp.scope !== "all" && !ms.some((n) => n.id === bp.scope)) bp.scope = "all";
    el<HTMLSelectElement>("bp-scope").value = bp.scope;
    el<HTMLSelectElement>("bp-belt").value = bp.belt;
    el<HTMLSelectElement>("bp-ins").value = bp.ins;
    el<HTMLInputElement>("bp-maxrow").value = String(bp.maxRow);
  }

  function renderBlueprint(): void {
    lightness = getVar("--item-l") || "62%";
    itemColor = itemColorFn(lightness);
    renderScope();
    const L = cur();
    const bp = bpSettings();
    const sol = bpSolution(L, bp);
    const lay = planLayout(sol, { belt: bp.belt, ins: bp.ins, maxRow: bp.maxRow });
    const editKey = bp.scope !== "all" ? bp.scope : "chain";
    const doc: EditDoc | null = (editKey === "chain" ? L.chainEdit : L.edits?.[editKey]) ?? null;
    const U = tierOf(bp).U;
    let sess: EditSession | null = null;
    if (doc) {
      const prev = BP?.session;
      if (prev && BP?.editKey === editKey && BP.doc === doc) {
        sess = prev;
        sess.U = U;
        actions.recalc(sess);
      } else {
        sess = actions.createSession(doc, U);
        ED.sel = [];
      }
    } else ED.sel = [];
    BP = { sol, lay, editKey, doc, session: sess };

    const editBtn = el("bp-edit");
    editBtn.hidden = !doc && !lay.ents.length;
    editBtn.textContent = doc ? "Discard edits" : "Edit layout";
    editBtn.classList.toggle("primary", !doc);
    el("ed-bar").hidden = !doc;
    el("bp-title").textContent = sol.title + (doc ? " · edited" : "");
    staleButtons = false;
    if (sess && doc) {
      const w: string[] = [];
      if (L.chainEdit && editKey === "chain") {
        const stale = staleWarnings(L.chainEdit.basis, sol, bp);
        w.push(...stale.map((s) => s.text));
        staleButtons = stale.length > 0;
      } else {
        const n = L.nodes.find((x) => x.id === editKey);
        const have = doc.ents.filter((e): e is EdEnt & { t: "machine" } => e.t === "machine");
        if (n?.kind === "machine") {
          const want = Math.ceil(Number(n.count) || 0);
          if (have.length !== want)
            w.push(
              `This module now has ${want} buildings but the edited layout has ${have.length}. Discard edits to start from a fresh layout, or set the count back on the Modules tab.`,
            );
          const first = have[0];
          if (first && have.some((e) => e.item !== n.item))
            w.push(
              `This module now makes ${nm(n.item)}, but the edited layout was made for ${nm(first.item)}. Discard edits to start over.`,
            );
        }
      }
      warnings = w;
      renderWarnings();
      el("legend").innerHTML = "";
      el("bpbox").hidden = true;
      view.fitted = false;
      refresh();
      store.saveNow();
      return;
    }
    const w = [...sol.warn, ...lay.warn];
    if (lay.conflicts)
      w.push(
        `${lay.conflicts} tiles overlap in the generated layout. Check the overlapping area before building.`,
      );
    warnings = w;
    renderWarnings();
    const c = lay.counts;
    el("bp-totals").innerHTML = sol.build.length
      ? `<span>Footprint <b>${lay.W}×${lay.H}</b></span><span>Machines <b>${c.machine}</b></span><span>Belts <b>${c.belt}</b></span><span>Undergrounds <b>${c.ug}</b></span><span>Splitters <b>${c.splitter}</b></span><span>Inserters <b>${c.ins + c.long}</b></span><span>Poles <b>${c.pole}</b></span>`
      : "";
    renderRowList();
    renderLegend();
    el("bpbox").hidden = true;
    view.fitted = false;
    bpDraw();
    store.saveNow();
  }

  const laneHtml = (list: { id: string }[], label: string): string =>
    list.length
      ? `<span class="lane">${label}: ${list
          .map(
            (s) =>
              `<span class="dot" style="background:${itemColor(s.id)}"></span>${esc(nm(s.id))}`,
          )
          .join(" + ")}</span>`
      : "";

  function renderRowList(): void {
    if (!BP) return;
    const LY = BP.lay;
    if (!LY.rows.length) {
      el("rowlist").innerHTML =
        `<p class="empty">No machine modules to lay out. Add some on the Modules tab.</p>`;
      return;
    }
    el("rowlist").innerHTML = LY.rows
      .map(
        (r, i) => `
    <button type="button" class="rowcard" data-row="${i}">
      <span class="rt">${sw(r.id)}${esc(nm(r.id))}${r.parts > 1 ? ` <span class="sub">part ${r.part + 1}/${r.parts}</span>` : ""}</span>
      <span class="m">${r.n}× ${esc(r.mname)} · ${rateStr(r.outPer * r.n)}${unitLbl()}</span>
      ${laneHtml(r.A, "Belt")}${laneHtml(r.C, "Far belt")}
      ${r.fluids.length || r.fluidOut ? `<span class="lane">Pipe: ${[...r.fluids.map((f) => nm(f.id)), ...(r.fluidOut ? [`${nm(r.id)} out`] : [])].map(esc).join(", ")}</span>` : ""}
      ${r.rowWarn.map((t) => `<span class="w">${esc(t)}</span>`).join("")}
    </button>`,
      )
      .join("");
  }

  function renderLegend(): void {
    if (!BP) return;
    const bp = bpSettings();
    const t = tierOf(bp);
    const it = INS_KINDS[bp.ins as "basic"];
    const tok = BELT_TOK[bp.belt];
    el("legend").innerHTML = [
      `<span><i class="lg" style="background:var(${tok})"></i>${t.name}</span>`,
      `<span><i class="lg" style="background:var(${tok});opacity:.55;outline:2px solid var(${tok})"></i>Underground pair</span>`,
      `<span><i class="lg" style="background:var(--machine);border-color:var(--machine-line)"></i>Machine</span>`,
      `<span><i class="lg" style="background:var(${INS_TOK[bp.ins]})"></i>${it.name}</span>`,
      `<span><i class="lg" style="background:var(--ins-long)"></i>Long-handed inserter</span>`,
      `<span><i class="lg" style="background:var(--pole);border-radius:50%"></i>Small pole</span>`,
      `<span><i class="lg" style="background:var(--pipe)"></i>Pipe guide</span>`,
      `<span>Arrow colour = item on that belt or lane</span>`,
    ].join("");
  }

  // ---------- editor state and panels ----------
  const toolState = () => ({ tool: ED.tool, dir: ED.dir, insKind: ED.insKind, feed: ED.feed });
  const editing = (): boolean => !!BP?.session;

  /** Writes the session back into the saved edit, then saves. */
  function syncDoc(soon: boolean): void {
    const s = session();
    if (s && BP?.doc) BP.doc.ents = s.ents;
    if (soon) store.saveSoon();
    else store.saveNow();
  }

  function pruneSel(): void {
    const s = session();
    if (!s) return;
    const live = new Set(s.ents);
    ED.sel = ED.sel.filter((e) => live.has(e));
  }

  function refresh(): void {
    const s = session();
    if (!s) return;
    pruneSel();
    ED.notes = annotate(s.ents, s.sim);
    toolbar();
    panel();
    totals();
    bpDraw();
  }

  function toolbar(): void {
    document
      .querySelectorAll<HTMLElement>("#ed-tools [data-tool]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === ED.tool)));
    el("ed-ins").hidden = ED.tool !== "ins";
    el("ed-feed").hidden = ED.tool !== "feed";
    el<HTMLSelectElement>("ed-ins").value = ED.insKind;
    el<HTMLSelectElement>("ed-feed").value = ED.feed;
    el("ed-rot").textContent = `Facing ${ARROW[ED.dir]} (R)`;
    el<HTMLButtonElement>("ed-undo").disabled = !session()?.undo.length;
    el("ed-hint").textContent = `${TOOL_HINT[ED.tool]} Right-drag pans with any tool.`;
  }

  const laneTxt = (s: Set<string> | undefined): string =>
    s && s.size ? [...s].map(short).join(" + ") : "empty";

  function describeEdit(e: EdEnt): string {
    const s = session();
    if (!s || !BP) return "";
    const tier = tierOf(bpSettings());
    if (e.t === "belt" || e.t === "ug" || e.t === "splitter") {
      const l = s.sim.LN.get(tkey(e.x, e.y));
      const name =
        e.t === "belt"
          ? tier.name
          : e.t === "ug"
            ? `Underground ${e.io === "input" ? "entrance" : "exit"}`
            : "Splitter";
      const feed = e.t === "belt" && e.feed ? ` · input: ${short(e.feed)}` : "";
      return `${name} ${ARROW[e.dir]} · left lane: ${laneTxt(l?.L)} · right lane: ${laneTxt(l?.R)}${feed}`;
    }
    if (e.t === "ins") return `${INS_KINDS[e.kind].name} · drops ${DIRNAME[e.dir]}`;
    if (e.t === "machine") return `${e.mname} · ${nm(e.item)}`;
    if (e.t === "pole") return "Small electric pole";
    return `Pipe guide · ${nm(e.item)} (not in blueprint)`;
  }

  function panel(): void {
    const s = session();
    if (!s) return;
    const button = (c: { x?: number; y?: number; text: string }): string =>
      `<button type="button" class="ed-check"${c.x != null ? ` data-at="${c.x},${c.y}"` : ""}>${esc(c.text)}</button>`;
    const groups = groupChecks(s.sim.checks);
    const checks = groups.length
      ? groups
          .map(
            (g) =>
              `${g.item && groups.length > 1 ? `<p class="sub">${esc(nm(g.item))}</p>` : ""}${g.checks.map(button).join("")}`,
          )
          .join("")
      : `<p class="clear">Every machine gets its ingredients and has an output, and no lane is mixed.</p>`;
    const first = ED.sel[0];
    const selected =
      ED.sel.length > 1
        ? `${ED.sel.length} pieces selected. Drag to move them together; Delete removes them (machines stay).`
        : first
          ? describeEdit(first)
          : "Nothing selected. Use the Select tool and click a piece.";
    el("rowlist").innerHTML = `
    <div class="ed-sec"><h3>Checks</h3>${checks}</div>
    <div class="ed-sec"><h3>Selected</h3><p class="sub">${esc(selected)}</p></div>
    <div class="ed-sec help"><h3>Reading the belts</h3><p>Each belt tile shows its two lanes, left and right as the belt travels. An arrow's colour is the item on that lane, grey means empty, and red means more than one item is mixed on the lane.</p>
      <p>Keys: 1–7 pick tools · R rotate (Shift+R back) · Delete remove · Ctrl+Z undo · Esc back to Select.</p></div>`;
  }

  function bounds(): { x0: number; y0: number; x1: number; y1: number } {
    const s = session();
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const e of s?.ents ?? []) {
      const [w, h] = foot(e);
      x0 = Math.min(x0, e.x);
      y0 = Math.min(y0, e.y);
      x1 = Math.max(x1, e.x + w);
      y1 = Math.max(y1, e.y + h);
    }
    return Number.isFinite(x0) ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 10, y1: 10 };
  }

  function totals(): void {
    const s = session();
    if (!s) return;
    const c: Record<string, number> = {};
    for (const e of s.ents) c[e.t] = (c[e.t] ?? 0) + 1;
    const b = bounds();
    el("bp-totals").innerHTML =
      `<span>Footprint <b>${b.x1 - b.x0}×${b.y1 - b.y0}</b></span><span>Machines <b>${c.machine ?? 0}</b></span><span>Belts <b>${c.belt ?? 0}</b></span><span>Undergrounds <b>${c.ug ?? 0}</b></span><span>Splitters <b>${c.splitter ?? 0}</b></span><span>Inserters <b>${c.ins ?? 0}</b></span><span>Poles <b>${c.pole ?? 0}</b></span>`;
  }

  function setTool(t: Tool): void {
    ED.tool = t;
    if (t !== "select") ED.sel = [];
    toolbar();
    panel();
    bpDraw();
  }

  function commitStep(): void {
    const s = session();
    if (!s) return;
    actions.commit(s);
    syncDoc(true);
    refresh();
  }

  function undoStep(): void {
    const s = session();
    if (!s || !actions.undo(s)) return;
    ED.sel = [];
    syncDoc(true);
    refresh();
  }

  function rotateSel(ccw: boolean): void {
    const s = session();
    const one = ED.sel.length === 1 ? ED.sel[0] : undefined;
    if (s && one && actions.rotate(s, one, ccw)) {
      syncDoc(true);
      refresh();
      return;
    }
    ED.dir = (ccw ? ROT_CCW : ROT_CW)[ED.dir];
    toolbar();
    bpDraw();
  }

  function deleteSel(): void {
    const s = session();
    if (!s || !ED.sel.length) return;
    const only = ED.sel.length === 1 ? ED.sel[0] : undefined;
    if (only) actions.deleteEnt(s, only);
    else deleteGroup(s, ED.sel);
    ED.sel = [];
    syncDoc(true);
    refresh();
  }

  // ---------- canvas ----------
  function fit(): void {
    const w = vp.clientWidth;
    const h = vp.clientHeight;
    const s = session();
    if (s) {
      const b = bounds();
      const ww = (b.x1 - b.x0 + 6) * TS;
      const wh = (b.y1 - b.y0 + 6) * TS;
      view.z = Math.max(0.15, Math.min(1.8, Math.min(w / ww, h / wh)));
      view.x = (w - (b.x1 - b.x0) * TS * view.z) / 2 - b.x0 * TS * view.z;
      view.y = (h - (b.y1 - b.y0) * TS * view.z) / 2 - b.y0 * TS * view.z;
    } else if (BP) {
      const ww = (BP.lay.W + PAD_RIGHT + 1) * TS;
      const wh = (BP.lay.H + PAD_TOP + 1) * TS;
      view.z = Math.max(0.15, Math.min(1.6, Math.min(w / ww, h / wh)));
      view.x = (w - ww * view.z) / 2 + TS * view.z * 0.5;
      view.y = Math.max(PAD_TOP * TS * view.z, (h - wh * view.z) / 2 + PAD_TOP * TS * view.z);
    }
    view.fitted = true;
  }

  const TOKENS = [
    "--canvas",
    "--grid",
    "--machine",
    "--machine-line",
    "--fg",
    "--muted",
    "--pole",
    "--pipe",
    "--accent",
    "--warn",
    "--ins-long",
    ...Object.values(BELT_TOK),
    ...Object.values(INS_TOK),
  ];

  function bpDraw(): void {
    if (!BP || vp.offsetParent === null) return;
    const dpr = window.devicePixelRatio || 1;
    const w = vp.clientWidth;
    const h = vp.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const colr: Record<string, string> = {};
    for (const n of TOKENS) colr[n] = getVar(n);
    const bp = bpSettings();
    const p: Paint = {
      ctx,
      w,
      h,
      dpr,
      view,
      colr,
      body: getVar("--body"),
      mono: getVar("--mono"),
      itemColor,
      beltTok: BELT_TOK[bp.belt] ?? "--belt-1",
      insTok: INS_TOK[bp.ins] ?? "--ins-fast",
    };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colr["--canvas"] ?? "#111";
    ctx.fillRect(0, 0, w, h);
    const s = session();
    if (s) {
      if (!view.fitted) fit();
      el("bp-zl").textContent = `${Math.round(view.z * 100)}%`;
      drawEditor(p, {
        session: s,
        sel: ED.sel,
        hover: ED.hover,
        dragging: !!ED.drag,
        tool: ED.tool,
        dir: ED.dir,
        insKind: ED.insKind,
        feed: ED.feed,
        box: ED.box,
        notes: ED.drag ? null : ED.notes,
      });
      return;
    }
    if (!BP.lay.ents.length) {
      el("bp-zl").textContent = `${Math.round(view.z * 100)}%`;
      drawNothing(p, "No machine modules to lay out yet.");
      return;
    }
    if (!view.fitted) fit();
    el("bp-zl").textContent = `${Math.round(view.z * 100)}%`;
    drawGenerated(p, BP.lay, BP.sol.final, rateStr, unitLbl());
  }

  function describeGenerated(e: LayoutEnt): string {
    if (!BP) return "";
    const t = BP.lay.tier;
    if (e.t === "belt")
      return e.lanes
        ? `${t.name} · ${[e.lanes.n, e.lanes.s]
            .filter((x): x is string => !!x)
            .map(nm)
            .join(" | ")}`
        : `${t.name} · ${e.item ? nm(e.item) : "empty"}`;
    if (e.t === "ug")
      return `Underground belt (${e.io === "input" ? "entrance" : "exit"}) · ${nm(e.item)}`;
    if (e.t === "splitter") return `Splitter · ${nm(e.item)}`;
    if (e.t === "machine") return `${e.mname} · ${nm(e.item)}`;
    if (e.t === "ins") return `${e.ins.name} · ${e.out ? "output" : "input"}`;
    if (e.t === "pole") return "Small electric pole";
    return `Pipe guide · ${nm(e.item)} (not in blueprint)`;
  }

  function showTip(text: string, ev: PointerEvent): void {
    const r = cv.getBoundingClientRect();
    tip.textContent = text;
    tip.hidden = false;
    tip.style.left = `${Math.min(ev.clientX - r.left + 14, r.width - tip.offsetWidth - 6)}px`;
    tip.style.top = `${Math.min(ev.clientY - r.top + 14, r.height - tip.offsetHeight - 6)}px`;
  }

  function zoomAt(f: number, px: number, py: number): void {
    const nz = Math.max(0.12, Math.min(4, view.z * f));
    const k = nz / view.z;
    view.x = px - (px - view.x) * k;
    view.y = py - (py - view.y) * k;
    view.z = nz;
    bpDraw();
  }

  const tileOf = (ev: PointerEvent): { x: number; y: number } => {
    const r = cv.getBoundingClientRect();
    return {
      x: Math.floor((ev.clientX - r.left - view.x) / view.z / TS),
      y: Math.floor((ev.clientY - r.top - view.y) / view.z / TS),
    };
  };
  const capture = (ev: PointerEvent): void => {
    try {
      cv.setPointerCapture(ev.pointerId);
    } catch {
      /* synthetic or already-ended pointer: dragging still works inside the canvas */
    }
  };

  // ---------- pointer: generated view ----------
  let panB: { x: number; y: number; vx: number; vy: number } | null = null;

  // ---------- pointer: editor ----------
  function editDown(ev: PointerEvent, s: EditSession): void {
    const t = tileOf(ev);
    const hit = actions.entAt(s, t.x, t.y);
    capture(ev);
    tip.hidden = true;
    if (
      ev.button === 1 ||
      ev.button === 2 ||
      (ev.button === 0 && ED.tool === "select" && !hit && !ev.shiftKey)
    ) {
      if (ev.button === 0 && ED.sel.length) {
        ED.sel = [];
        panel();
      }
      ED.drag = { type: "pan", x: ev.clientX, y: ev.clientY, vx: view.x, vy: view.y };
      cv.classList.add("drag");
      bpDraw();
      return;
    }
    if (ev.button !== 0) return;
    if (ED.tool === "select") {
      if (ev.shiftKey && !hit) {
        ED.drag = { type: "box", from: t };
        ED.box = { x0: t.x, y0: t.y, x1: t.x, y1: t.y };
      } else if (hit) {
        if (!ED.sel.includes(hit)) ED.sel = [hit];
        actions.begin(s);
        ED.drag = { type: "move", ents: [...ED.sel], ox: t.x, oy: t.y, dx: 0, dy: 0 };
        panel();
      }
    } else {
      actions.begin(s);
      if (ED.tool === "belt") {
        actions.placeBelt(s, t.x, t.y, ED.dir);
        ED.drag = { type: "belt", last: t };
      } else if (ED.tool === "erase") {
        actions.erase(s, t.x, t.y);
        ED.drag = { type: "erase" };
      } else {
        actions.place(s, toolState(), t.x, t.y);
        ED.drag = { type: "click" };
      }
    }
    bpDraw();
  }

  function editMove(ev: PointerEvent, s: EditSession): void {
    const t = tileOf(ev);
    const d = ED.drag;
    if (d?.type === "pan") {
      view.x = d.vx + ev.clientX - d.x;
      view.y = d.vy + ev.clientY - d.y;
      bpDraw();
      return;
    }
    const moved = !ED.hover || ED.hover.x !== t.x || ED.hover.y !== t.y;
    ED.hover = t;
    if (d?.type === "move") {
      const ix = t.x - d.ox - d.dx;
      const iy = t.y - d.oy - d.dy;
      if ((ix !== 0 || iy !== 0) && canMoveGroup(s, d.ents, ix, iy)) {
        for (const e of d.ents) {
          e.x += ix;
          e.y += iy;
        }
        d.dx += ix;
        d.dy += iy;
        actions.recalc(s);
        panel();
      }
    } else if (d?.type === "belt") {
      let { x, y } = d.last;
      while (x !== t.x || y !== t.y) {
        const dir: Dir = x !== t.x ? (t.x > x ? "E" : "W") : t.y > y ? "S" : "N";
        const prev = actions.entAt(s, x, y);
        if (prev && prev.t === "belt") prev.dir = dir;
        x += DV[dir][0];
        y += DV[dir][1];
        actions.placeBelt(s, x, y, dir);
        ED.dir = dir;
      }
      d.last = t;
      actions.recalc(s);
      toolbar();
    } else if (d?.type === "erase") actions.erase(s, t.x, t.y);
    else if (d?.type === "box" && ED.box) {
      ED.box = { x0: d.from.x, y0: d.from.y, x1: t.x, y1: t.y };
    }
    if (d || moved) bpDraw();
    if (!d) {
      const e = actions.entAt(s, t.x, t.y);
      if (!e) tip.hidden = true;
      else showTip(describeEdit(e), ev);
    }
  }

  function editUp(s: EditSession): void {
    const d = ED.drag;
    ED.drag = null;
    cv.classList.remove("drag");
    if (d?.type === "box" && ED.box) {
      ED.sel = selectInBox(s, ED.box);
      ED.box = null;
      panel();
      bpDraw();
    } else if (d && d.type !== "pan") commitStep();
    else bpDraw();
  }

  cv.addEventListener("pointerdown", (ev) => {
    const s = session();
    if (s) return editDown(ev, s);
    panB = { x: ev.clientX, y: ev.clientY, vx: view.x, vy: view.y };
    capture(ev);
    cv.classList.add("drag");
    tip.hidden = true;
  });
  cv.addEventListener("pointermove", (ev) => {
    const s = session();
    if (s) return editMove(ev, s);
    if (panB) {
      view.x = panB.vx + ev.clientX - panB.x;
      view.y = panB.vy + ev.clientY - panB.y;
      bpDraw();
      return;
    }
    if (!BP) return;
    const t = tileOf(ev);
    const ent = BP.lay.G.get(tkey(t.x, t.y));
    if (!ent) tip.hidden = true;
    else showTip(describeGenerated(ent), ev);
  });
  const end = (): void => {
    const s = session();
    if (s) return editUp(s);
    panB = null;
    cv.classList.remove("drag");
  };
  cv.addEventListener("pointerup", end);
  cv.addEventListener("pointercancel", end);
  cv.addEventListener("pointerleave", () => {
    tip.hidden = true;
    if (editing() && !ED.drag) {
      ED.hover = null;
      bpDraw();
    }
  });
  cv.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      const r = cv.getBoundingClientRect();
      zoomAt(Math.exp(-ev.deltaY * 0.0015), ev.clientX - r.left, ev.clientY - r.top);
    },
    { passive: false },
  );
  cv.addEventListener("contextmenu", (ev) => {
    if (editing()) ev.preventDefault();
  });
  el("bp-zin").addEventListener("click", () =>
    zoomAt(1.25, vp.clientWidth / 2, vp.clientHeight / 2),
  );
  el("bp-zout").addEventListener("click", () =>
    zoomAt(1 / 1.25, vp.clientWidth / 2, vp.clientHeight / 2),
  );
  el("bp-fit").addEventListener("click", () => {
    view.fitted = false;
    bpDraw();
  });

  el("rowlist").addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement;
    const s = session();
    if (s) {
      const b = target.closest<HTMLElement>("[data-at]");
      if (!b?.dataset.at) return;
      const [x, y] = b.dataset.at.split(",").map(Number) as [number, number];
      view.z = Math.max(view.z, 1.2);
      view.x = vp.clientWidth / 2 - (x + 0.5) * TS * view.z;
      view.y = vp.clientHeight / 2 - (y + 0.5) * TS * view.z;
      const e = actions.entAt(s, x, y);
      if (e) ED.sel = [e];
      panel();
      bpDraw();
      return;
    }
    const b = target.closest<HTMLElement>("[data-row]");
    if (!b || !BP) return;
    const LY = BP.lay;
    const r = LY.rows[Number(b.dataset.row)];
    if (!r) return;
    view.z = Math.max(view.z, 0.9);
    const cx = ((LY.xb + r.rowEnd) / 2) * TS;
    const cy = ((r.T + r.bottom) / 2) * TS;
    view.x = vp.clientWidth / 2 - cx * view.z;
    view.y = vp.clientHeight / 2 - cy * view.z;
    bpDraw();
  });

  // ---------- keys and toolbar ----------
  document.addEventListener("keydown", (ev) => {
    const s = session();
    if (!s || el("view-bp").hidden || (ev.target as HTMLElement).closest("input, select, textarea"))
      return;
    const k = ev.key;
    if ((ev.ctrlKey || ev.metaKey) && k.toLowerCase() === "z") {
      ev.preventDefault();
      undoStep();
      return;
    }
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (/^[1-7]$/.test(k)) setTool(TOOLS[Number(k) - 1] ?? "select");
    else if (k === "r" || k === "R") {
      ev.preventDefault();
      rotateSel(ev.shiftKey);
    } else if (k === "Delete" || k === "Backspace") {
      ev.preventDefault();
      deleteSel();
    } else if (k === "Escape") {
      ED.sel = [];
      setTool("select");
    }
  });
  el("ed-tools").addEventListener("click", (ev) => {
    const t = (ev.target as HTMLElement).closest<HTMLElement>("[data-tool]")?.dataset.tool;
    if (t && (TOOLS as string[]).includes(t)) setTool(t as Tool);
  });
  el("ed-ins").addEventListener("change", (ev) => {
    ED.insKind = (ev.target as HTMLSelectElement).value as InsKind;
    bpDraw();
  });
  el("ed-feed").addEventListener("change", (ev) => {
    ED.feed = (ev.target as HTMLSelectElement).value;
    bpDraw();
  });
  el("ed-feed").innerHTML = Object.keys(ITEMS)
    .filter((id) => !isFluid(id))
    .map((id) => `<option value="${id}">${esc(nm(id))}</option>`)
    .join("");
  el("ed-rot").addEventListener("click", () => rotateSel(false));
  el("ed-undo").addEventListener("click", undoStep);

  // ---------- settings ----------
  const onSetting = (id: string, apply: (bp: BpSettings, v: string) => void): void => {
    el(id).addEventListener("change", (ev) => {
      apply(bpSettings(), (ev.target as HTMLInputElement | HTMLSelectElement).value);
      renderBlueprint();
    });
  };
  onSetting("bp-scope", (bp, v) => (bp.scope = v));
  onSetting("bp-belt", (bp, v) => (bp.belt = v));
  onSetting("bp-ins", (bp, v) => (bp.ins = v));
  onSetting(
    "bp-maxrow",
    (bp, v) => (bp.maxRow = Math.max(1, Math.min(40, Math.round(Number(v) || 12)))),
  );

  // edit / discard
  const editBtn = el("bp-edit");
  let discardArmed: ReturnType<typeof setTimeout> | null = null;
  const disarm = (): void => {
    if (discardArmed) clearTimeout(discardArmed);
    discardArmed = null;
    editBtn.classList.remove("armed");
  };
  editBtn.addEventListener("click", () => {
    if (!BP) return;
    const L = cur();
    const bp = bpSettings();
    const chain = BP.editKey === "chain";
    if (!BP.doc) {
      if (chain) L.chainEdit = startChainEdit(BP.lay, BP.sol, bp);
      else (L.edits ??= {})[BP.editKey] = edFromLayout(BP.lay, bp);
      ED.sel = [];
      store.saveNow();
      renderBlueprint();
      return;
    }
    if (!discardArmed) {
      editBtn.classList.add("armed");
      editBtn.textContent = "Confirm discard";
      discardArmed = setTimeout(() => {
        disarm();
        editBtn.textContent = "Discard edits";
      }, 4000);
      return;
    }
    disarm();
    if (chain) delete L.chainEdit;
    else if (L.edits) delete L.edits[BP.editKey];
    ED.sel = [];
    store.saveNow();
    renderBlueprint();
  });
  el("bp-warn").addEventListener("click", (ev) => {
    if ((ev.target as HTMLElement).closest("[data-act=discard]")) editBtn.click();
  });

  // copy
  el("bp-copy").addEventListener("click", async () => {
    const box = el("bpbox");
    const ta = el<HTMLTextAreaElement>("bptext");
    const note = el("bpnote");
    if (!BP) return;
    const s = session();
    const bp = bpSettings();
    const ents = s ? s.ents : edFromLayout(BP.lay, bp).ents;
    if (!ents.length) return;
    if (typeof CompressionStream === "undefined") {
      box.hidden = false;
      ta.value = "";
      note.textContent =
        "This browser can't compress blueprint strings. Try a current Chrome, Edge, Firefox or Safari.";
      return;
    }
    const obj = blueprintObject(
      ents,
      tierOf(bp),
      BP.sol.icon,
      s ? `${BP.sol.label} (edited)` : BP.sol.label,
    );
    const str = await encodeBlueprint(obj);
    box.hidden = false;
    ta.value = str;
    const pipes = ents.some((e) => e.t === "pipe")
      ? " Pipes aren't included; place them by hand."
      : "";
    try {
      await navigator.clipboard.writeText(str);
      note.textContent = `Copied to clipboard.${pipes}`;
    } catch {
      ta.focus();
      ta.select();
      note.textContent = `Select the text above and copy it.${pipes}`;
    }
  });

  window.addEventListener("resize", () => {
    if (!el("view-bp").hidden) {
      view.fitted = false;
      bpDraw();
    }
  });
  const redrawTheme = (): void => {
    if (el("view-bp").hidden || !BP) return;
    lightness = getVar("--item-l") || "62%";
    itemColor = itemColorFn(lightness);
    if (!session()) renderRowList();
    bpDraw();
  };
  try {
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redrawTheme);
  } catch {
    /* no matchMedia: the theme just won't follow the system */
  }
  new MutationObserver(redrawTheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  void document.fonts?.ready.then(() => bpDraw());

  return {
    show: renderBlueprint,
    openModule(nodeId: string): void {
      bpSettings().scope = nodeId;
    },
  };
}
