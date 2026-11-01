/** Number formatting ported from `fmt` in artifacts/FCP_v1-2.html (line 551). */
export function fmt(n: number, d = 1): string {
  if (!isFinite(n)) return "–";
  const v = Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(d);
  return v.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}
