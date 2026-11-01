// Canvas drawing for the Blueprint tab: the generated layout and the editor. Ported from
// `bpDraw`, `chevron`, `edDrawEnt` and `edDraw` (artifacts/FCP_v1-2.html, lines 1553-1653 and
// 1973-2054), plus labels from src/editor/annotations.ts. Draws only; no state of its own.
import { ITEMS_IN_ORDER, itemName } from "../data/game.ts";
import type { Layout } from "../blueprint/layout.ts";
import type { EditSession } from "../editor/actions.ts";
import type { Annotations } from "../editor/annotations.ts";
import { DV, LEFT, foot, tilesOf, tkey } from "../editor/geometry.ts";
import type { TileBox } from "../editor/selection.ts";
import type { Dir, EdEnt } from "../editor/types.ts";

export const TS = 20;
export const PAD_TOP = 7;
export const PAD_RIGHT = 16;

/** CSS custom properties that name each belt tier and inserter kind's colour. */
export const BELT_TOK: Record<string, string> = {
  "transport-belt": "--belt-1",
  "fast-transport-belt": "--belt-2",
  "express-transport-belt": "--belt-3",
  "turbo-transport-belt": "--belt-4",
};
export const INS_TOK: Record<string, string> = {
  basic: "--ins-basic",
  fast: "--ins-fast",
  bulk: "--ins-bulk",
  long: "--ins-long",
};

export interface BpView {
  z: number;
  x: number;
  y: number;
  fitted: boolean;
}

export const getVar = (n: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(n).trim();

const ITEM_IDS = ITEMS_IN_ORDER;
export function itemColorFn(lightness: string): (id: string | null | undefined) => string {
  return (id) => {
    const i = id ? ITEM_IDS.indexOf(id) : -1;
    return `hsl(${(i < 0 ? 0 : (i * 137.508 + 20) % 360).toFixed(0)} 62% ${lightness})`;
  };
}

export interface Paint {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  dpr: number;
  view: BpView;
  colr: Record<string, string>;
  body: string;
  mono: string;
  itemColor: (id: string | null | undefined) => string;
  beltTok: string;
  insTok: string;
}

const DIR_ANGLE: Record<Dir, number> = { N: -Math.PI / 2, E: 0, S: Math.PI / 2, W: Math.PI };

export function chevron(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  dir: Dir,
  s: number,
  color: string,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(DIR_ANGLE[dir]);
  ctx.beginPath();
  ctx.moveTo(-s * 0.45, -s * 0.6);
  ctx.lineTo(s * 0.35, 0);
  ctx.lineTo(-s * 0.45, s * 0.6);
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.38;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();
}

const col = (p: Paint, tok: string): string => p.colr[tok] ?? "#888";

function machineLabel(ent: string): string {
  return ent
    .replace("assembling-machine-", "AM")
    .replace("chemical-plant", "CHEM")
    .replace("electric-furnace", "E-FURN");
}

/** Generated (read-only) layout. `rate` formats items per second for the row labels. */
export function drawGenerated(
  p: Paint,
  LY: Layout,
  final: string | null | undefined,
  rate: (r: number) => string,
  unit: string,
): void {
  const { ctx, view } = p;
  ctx.setTransform(p.dpr * view.z, 0, 0, p.dpr * view.z, p.dpr * view.x, p.dpr * view.y);
  const z = view.z;
  const T = TS;
  const beltC = col(p, p.beltTok);
  if (z * T >= 9) {
    ctx.fillStyle = col(p, "--grid");
    for (let x = 0; x <= LY.W; x++)
      for (let y = 0; y <= LY.H; y++) ctx.fillRect(x * T - 1, y * T - 1, 2, 2);
  }
  ctx.save();
  ctx.font = `600 11px ${p.body}`;
  for (const c of LY.cols) {
    ctx.save();
    ctx.translate(c.x * T + T * 0.62, -T * 0.4);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = p.itemColor(c.item);
    ctx.fillText(itemName(c.item), 0, 0);
    ctx.restore();
    if (!c.raw && c.start != null) {
      ctx.strokeStyle = col(p, "--grid");
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(c.x * T + T / 2, 0);
      ctx.lineTo(c.x * T + T / 2, c.start * T);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  ctx.restore();
  ctx.strokeStyle = beltC;
  ctx.globalAlpha = 0.55;
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 2;
  for (const q of LY.pairs) {
    ctx.beginPath();
    ctx.moveTo((q.a + 1) * T, (q.y + 0.5) * T);
    ctx.lineTo(q.b * T, (q.y + 0.5) * T);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  for (const e of LY.ents) {
    const x = e.x * T;
    const y = e.y * T;
    if (e.t === "belt") {
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = beltC;
      ctx.fillRect(x + 1, y + 1, T - 2, T - 2);
      ctx.globalAlpha = 1;
      if (e.lanes) {
        const o = T * 0.24;
        if (e.lanes.n)
          chevron(ctx, x + T / 2, y + T / 2 - o, e.dir, T * 0.3, p.itemColor(e.lanes.n));
        if (e.lanes.s)
          chevron(ctx, x + T / 2, y + T / 2 + o, e.dir, T * 0.3, p.itemColor(e.lanes.s));
      } else chevron(ctx, x + T / 2, y + T / 2, e.dir, T * 0.42, p.itemColor(e.item));
    } else if (e.t === "ug") {
      ctx.fillStyle = beltC;
      ctx.fillRect(x + 2, y + 3, T - 4, T - 6);
      ctx.fillStyle = col(p, "--canvas");
      if (e.io === "input") ctx.fillRect(x + T - 6, y + 6, 3, T - 12);
      else ctx.fillRect(x + 3, y + 6, 3, T - 12);
      chevron(ctx, x + T / 2, y + T / 2, e.dir, T * 0.3, p.itemColor(e.item));
    } else if (e.t === "splitter") {
      ctx.fillStyle = beltC;
      ctx.globalAlpha = 0.75;
      ctx.fillRect(x + 1, y + 4, 2 * T - 2, T - 8);
      ctx.globalAlpha = 1;
      chevron(ctx, x + T / 2, y + T / 2, e.dir, T * 0.36, p.itemColor(e.item));
      chevron(ctx, x + T * 1.5, y + T / 2, e.dir, T * 0.36, col(p, "--canvas"));
    } else if (e.t === "machine") {
      ctx.fillStyle = col(p, "--machine");
      ctx.fillRect(x + 1.5, y + 1.5, e.w * T - 3, e.h * T - 3);
      ctx.strokeStyle = col(p, "--machine-line");
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 1.5, y + 1.5, e.w * T - 3, e.h * T - 3);
      ctx.fillStyle = p.itemColor(e.item);
      ctx.beginPath();
      ctx.arc(
        x + (e.w * T) / 2,
        y + (e.h * T) / 2 - (e.w === 3 ? 5 : 0),
        e.w === 3 ? 8 : 6,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      if (e.w === 3 && z * T >= 12) {
        ctx.fillStyle = col(p, "--muted");
        ctx.font = `600 9px ${p.mono}`;
        ctx.textAlign = "center";
        ctx.fillText(machineLabel(e.ent), x + (e.w * T) / 2, y + e.h * T - 8);
        ctx.textAlign = "left";
      }
    } else if (e.t === "ins") {
      const c = p.colr[e.long ? "--ins-long" : p.insTok] ?? col(p, "--ins-long");
      ctx.fillStyle = c;
      ctx.fillRect(x + T * 0.3, y + T * 0.3, T * 0.4, T * 0.4);
      ctx.strokeStyle = c;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      const reach = e.long ? T * 0.5 : T * 0.4;
      ctx.moveTo(x + T / 2, y + T / 2 - reach);
      ctx.lineTo(x + T / 2, y + T / 2 + reach);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + T / 2 - 4, y + T / 2 + reach - 4);
      ctx.lineTo(x + T / 2, y + T / 2 + reach);
      ctx.lineTo(x + T / 2 + 4, y + T / 2 + reach - 4);
      ctx.stroke();
    } else if (e.t === "pole") {
      ctx.fillStyle = col(p, "--pole");
      ctx.beginPath();
      ctx.arc(x + T / 2, y + T / 2, T * 0.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = col(p, "--pipe");
      ctx.globalAlpha = 0.7;
      ctx.fillRect(x, y + T * 0.36, T, T * 0.28);
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.itemColor(e.item);
      ctx.fillRect(x + T * 0.42, y + T * 0.36, T * 0.16, T * 0.28);
    }
  }
  ctx.textAlign = "left";
  for (const r of LY.rows) {
    const lx = (r.hasC ? r.jxC + 3 : r.rowEnd + 2) * T;
    const ly = (r.yM + r.w / 2) * T;
    ctx.fillStyle = col(p, "--fg");
    ctx.font = `600 13px ${p.body}`;
    ctx.fillText(
      `${itemName(r.id)}${r.parts > 1 ? ` (${r.part + 1}/${r.parts})` : ""}`,
      lx,
      ly - 2,
    );
    ctx.fillStyle = col(p, "--muted");
    ctx.font = `500 11px ${p.mono}`;
    ctx.fillText(`${r.n}× · ${rate(r.outPer * r.n)}${unit}`, lx, ly + 12);
    if (r.rowWarn.length) {
      ctx.fillStyle = col(p, "--warn");
      ctx.fillText("check inserters", lx, ly + 25);
    }
    for (const pp of r.pipes) {
      ctx.fillStyle = col(p, "--pipe");
      ctx.font = `500 10px ${p.body}`;
      ctx.textAlign = "right";
      ctx.fillText(
        `${itemName(pp.item)} ${pp.dir === "in" ? "in" : "out"}`,
        (LY.rowX0 - 1.2) * T,
        (pp.y + 0.72) * T,
      );
      ctx.textAlign = "left";
    }
  }
  const fc = final ? LY.cols.find((c) => c.item === final) : undefined;
  if (fc) {
    ctx.fillStyle = col(p, "--accent");
    ctx.font = `700 12px ${p.body}`;
    ctx.fillText(`↓ ${itemName(fc.item)} out`, fc.x * T - 4, (LY.H + 0.6) * T);
  }
}

// ---------- editor ----------

/** Everything the editor draws besides the entities themselves. */
export interface EditPaint {
  session: EditSession;
  sel: EdEnt[];
  hover: { x: number; y: number } | null;
  dragging: boolean;
  tool: string;
  dir: Dir;
  insKind: string;
  feed: string;
  box: TileBox | null;
  notes: Annotations | null;
}

function drawEnt(p: Paint, E: EditPaint, e: EdEnt, ghost: boolean): void {
  const { ctx } = p;
  const T = TS;
  const x = e.x * T;
  const y = e.y * T;
  const S = E.session.sim;
  const beltC = col(p, p.beltTok);
  const laneCol = (s: Set<string> | undefined): string =>
    !s || !s.size
      ? col(p, "--machine-line")
      : s.size > 1
        ? col(p, "--warn")
        : p.itemColor([...s][0]);
  const laneChevrons = (tx: number, ty: number, dir: Dir, s: number): void => {
    const l = ghost ? undefined : S.LN.get(tkey(tx, ty));
    const [lx, ly] = DV[LEFT[dir]];
    const o = T * 0.22;
    const cx = tx * T + T / 2;
    const cy = ty * T + T / 2;
    chevron(ctx, cx + lx * o, cy + ly * o, dir, T * s, laneCol(l?.L));
    chevron(ctx, cx - lx * o, cy - ly * o, dir, T * s, laneCol(l?.R));
  };
  if (e.t === "belt") {
    ctx.globalAlpha = ghost ? 0.25 : 0.32;
    ctx.fillStyle = beltC;
    ctx.fillRect(x + 1, y + 1, T - 2, T - 2);
    ctx.globalAlpha = ghost ? 0.6 : 1;
    laneChevrons(e.x, e.y, e.dir, 0.28);
    if (e.feed) {
      ctx.strokeStyle = p.itemColor(e.feed);
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x + 1.5, y + 1.5, T - 3, T - 3);
    }
    if (!ghost && S.mixedSet.has(e)) {
      ctx.strokeStyle = col(p, "--warn");
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1);
    }
  } else if (e.t === "ug") {
    ctx.fillStyle = beltC;
    ctx.globalAlpha = ghost ? 0.5 : 1;
    ctx.fillRect(x + 2, y + 2, T - 4, T - 4);
    ctx.fillStyle = col(p, "--canvas");
    const [dx, dy] = DV[e.dir];
    const back = e.io === "input" ? 1 : -1; // dark bar on the tunnel side
    ctx.fillRect(
      x + T / 2 - 2 + dx * back * 6 - (dy ? 6 : 0),
      y + T / 2 - 2 + dy * back * 6 - (dx ? 6 : 0),
      dy ? 16 : 4,
      dx ? 16 : 4,
    );
    laneChevrons(e.x, e.y, e.dir, 0.24);
  } else if (e.t === "splitter") {
    const [w, h] = foot(e);
    ctx.fillStyle = beltC;
    ctx.globalAlpha = 0.75;
    ctx.fillRect(x + 1, y + 1, w * T - 2, h * T - 2);
    ctx.globalAlpha = 1;
    for (const k of tilesOf(e)) {
      const [tx, ty] = k.split(",").map(Number) as [number, number];
      laneChevrons(tx, ty, e.dir, 0.26);
    }
  } else if (e.t === "machine") {
    const bad = !ghost && S.checks.some((c) => c.m === e);
    ctx.fillStyle = col(p, "--machine");
    ctx.fillRect(x + 1.5, y + 1.5, e.w * T - 3, e.h * T - 3);
    ctx.strokeStyle = bad ? col(p, "--warn") : col(p, "--machine-line");
    ctx.lineWidth = bad ? 2.5 : 1.5;
    ctx.strokeRect(x + 1.5, y + 1.5, e.w * T - 3, e.h * T - 3);
    ctx.fillStyle = p.itemColor(e.item);
    ctx.beginPath();
    ctx.arc(
      x + (e.w * T) / 2,
      y + (e.h * T) / 2 - (e.w === 3 ? 5 : 0),
      e.w === 3 ? 8 : 6,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    if (e.w === 3 && p.view.z * T >= 12) {
      ctx.fillStyle = col(p, "--muted");
      ctx.font = `600 9px ${p.mono}`;
      ctx.textAlign = "center";
      ctx.fillText(itemName(e.item).slice(0, 10), x + (e.w * T) / 2, y + e.h * T - 7);
      ctx.textAlign = "left";
    }
    if (bad) {
      ctx.fillStyle = col(p, "--warn");
      ctx.beginPath();
      ctx.arc(x + e.w * T - 5, y + 5, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (e.t === "ins") {
    const c = p.colr[INS_TOK[e.kind] ?? ""] ?? col(p, "--ins-long");
    const reach = e.kind === "long" ? T * 0.5 : T * 0.4;
    ctx.save();
    ctx.globalAlpha = ghost ? 0.6 : 1;
    ctx.translate(x + T / 2, y + T / 2);
    ctx.rotate({ S: 0, W: Math.PI / 2, N: Math.PI, E: -Math.PI / 2 }[e.dir]);
    ctx.fillStyle = c;
    ctx.fillRect(-T * 0.2, -T * 0.2, T * 0.4, T * 0.4);
    ctx.strokeStyle = c;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, -reach);
    ctx.lineTo(0, reach);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-4, reach - 4);
    ctx.lineTo(0, reach);
    ctx.lineTo(4, reach - 4);
    ctx.stroke();
    ctx.restore();
  } else if (e.t === "pole") {
    ctx.globalAlpha = ghost ? 0.6 : 1;
    ctx.fillStyle = col(p, "--pole");
    ctx.beginPath();
    ctx.arc(x + T / 2, y + T / 2, T * 0.2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = col(p, "--pipe");
    ctx.globalAlpha = 0.7;
    ctx.fillRect(x, y + T * 0.36, T, T * 0.28);
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.itemColor(e.item);
    ctx.fillRect(x + T * 0.42, y + T * 0.36, T * 0.16, T * 0.28);
  }
  ctx.globalAlpha = 1;
}

export function drawEditor(p: Paint, E: EditPaint): void {
  const { ctx, view, w, h } = p;
  const T = TS;
  const z = view.z;
  const S = E.session.sim;
  ctx.setTransform(p.dpr * z, 0, 0, p.dpr * z, p.dpr * view.x, p.dpr * view.y);
  // visible tile range, so only what's on screen is drawn
  const vx0 = Math.floor(-view.x / z / T) - 1;
  const vy0 = Math.floor(-view.y / z / T) - 1;
  const vx1 = vx0 + Math.ceil(w / z / T) + 2;
  const vy1 = vy0 + Math.ceil(h / z / T) + 2;
  if (z * T >= 9) {
    ctx.fillStyle = col(p, "--grid");
    for (let x = vx0; x <= vx1; x++)
      for (let y = vy0; y <= vy1; y++) ctx.fillRect(x * T - 1, y * T - 1, 2, 2);
  }
  const beltC = col(p, p.beltTok);
  ctx.strokeStyle = beltC;
  ctx.globalAlpha = 0.55;
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 2;
  for (const [a, b] of S.pair) {
    if (a.t !== "ug" || a.io !== "input") continue;
    ctx.beginPath();
    ctx.moveTo((a.x + 0.5) * T, (a.y + 0.5) * T);
    ctx.lineTo((b.x + 0.5) * T, (b.y + 0.5) * T);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  for (const e of E.session.ents) {
    const [fw, fh] = foot(e);
    if (e.x > vx1 || e.y > vy1 || e.x + fw < vx0 || e.y + fh < vy0) continue;
    drawEnt(p, E, e, false);
  }
  if (z * T >= 10) drawNotes(p, E);
  ctx.strokeStyle = col(p, "--accent");
  for (const s of E.sel) {
    const [fw, fh] = foot(s);
    ctx.lineWidth = (2.5 / z) * 1.2;
    ctx.strokeRect(s.x * T - 1, s.y * T - 1, fw * T + 2, fh * T + 2);
  }
  if (E.box) {
    const x0 = Math.min(E.box.x0, E.box.x1);
    const y0 = Math.min(E.box.y0, E.box.y1);
    const bw = Math.abs(E.box.x1 - E.box.x0) + 1;
    const bh = Math.abs(E.box.y1 - E.box.y0) + 1;
    ctx.fillStyle = col(p, "--accent");
    ctx.globalAlpha = 0.12;
    ctx.fillRect(x0 * T, y0 * T, bw * T, bh * T);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5 / z;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x0 * T, y0 * T, bw * T, bh * T);
    ctx.setLineDash([]);
  }
  const hv = E.hover;
  if (hv && !E.dragging && E.tool !== "select") {
    const ex = S.G.get(tkey(hv.x, hv.y));
    if (E.tool === "erase") {
      if (ex && ex.t !== "machine") {
        const [fw, fh] = foot(ex);
        ctx.strokeStyle = col(p, "--warn");
        ctx.lineWidth = 2;
        ctx.strokeRect(ex.x * T, ex.y * T, fw * T, fh * T);
      }
      return;
    }
    const ghost: EdEnt =
      E.tool === "belt" || E.tool === "feed"
        ? {
            t: "belt",
            x: hv.x,
            y: hv.y,
            dir: E.dir,
            ...(E.tool === "feed" ? { feed: E.feed } : {}),
          }
        : E.tool === "ins"
          ? { t: "ins", x: hv.x, y: hv.y, dir: E.dir, kind: E.insKind as "basic" }
          : E.tool === "ug"
            ? { t: "ug", x: hv.x, y: hv.y, dir: E.dir, io: "input" }
            : { t: "pole", x: hv.x, y: hv.y };
    if (!ex || (ex.t === ghost.t && ghost.t !== "pole")) drawEnt(p, E, ghost, true);
    else {
      ctx.strokeStyle = col(p, "--warn");
      ctx.lineWidth = 1.5;
      ctx.strokeRect(hv.x * T + 2, hv.y * T + 2, T - 4, T - 4);
    }
  }
}

/** Input, product, output and row labels, kept in edit mode (docs/chain-edit-plan.md, section 5). */
function drawNotes(p: Paint, E: EditPaint): void {
  const { ctx } = p;
  const T = TS;
  const S = E.session.sim;
  ctx.font = `600 11px ${p.body}`;
  const rotated = (x: number, y: number, text: string, color: string): void => {
    ctx.save();
    ctx.translate(x * T + T * 0.62, y * T - T * 0.3);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };
  const at = (x: number, y: number): EdEnt | undefined => S.G.get(tkey(x, y));
  for (const e of E.session.ents)
    if (e.t === "belt" && e.feed && !at(e.x, e.y - 1))
      rotated(e.x, e.y, itemName(e.feed), p.itemColor(e.feed));
  const n = E.notes;
  if (!n) return;
  ctx.textAlign = "left";
  for (const r of n.rows) {
    ctx.fillStyle = col(p, "--muted");
    ctx.font = `500 11px ${p.mono}`;
    const m = S.G.get(tkey(r.x, r.y));
    const mw = m ? foot(m)[0] : 3;
    ctx.fillText(`${r.count}× ${itemName(r.item)}`, (r.x + r.count * mw + 1) * T, (r.y + 1.6) * T);
  }
  ctx.font = `700 12px ${p.body}`;
  for (const o of n.outputs) {
    ctx.fillStyle = col(p, "--accent");
    ctx.fillText(`↓ ${itemName(o.item)} out`, o.x * T - 4, (o.y + 1.6) * T);
  }
}

export function drawNothing(p: Paint, text: string): void {
  const { ctx } = p;
  ctx.fillStyle = col(p, "--muted");
  ctx.font = `500 14px ${p.body}`;
  ctx.textAlign = "center";
  ctx.fillText(text, p.w / 2, p.h / 2);
  ctx.textAlign = "left";
}
