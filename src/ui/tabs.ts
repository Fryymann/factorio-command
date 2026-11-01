// Tab switching. Ported from artifacts/FCP_v1-2.html (the tab handlers near line 2152).
const TABS = ["calc", "plan", "bp"] as const;
const HASH: Record<TabId, string> = { calc: "#calculator", plan: "#modules", bp: "#blueprint" };
export type TabId = (typeof TABS)[number];

export function mountTabs(onShow?: (tab: TabId) => void): {
  show(tab: TabId): void;
  showFromHash(): void;
} {
  const show = (t: TabId): void => {
    for (const id of TABS) {
      const tab = document.getElementById(`tab-${id}`);
      const view = document.getElementById(`view-${id}`);
      if (!tab || !view) throw new Error(`Missing tab or view for "${id}" in index.html`);
      tab.setAttribute("aria-selected", String(id === t));
      view.hidden = id !== t;
    }
    document.querySelector(".wrap")?.classList.toggle("wide", t !== "calc");
    try {
      history.replaceState(null, "", HASH[t]);
    } catch {
      /* file:// pages and some sandboxes refuse; the tab still switches */
    }
    onShow?.(t);
  };
  for (const id of TABS)
    document.getElementById(`tab-${id}`)?.addEventListener("click", () => show(id));
  const showFromHash = (): void =>
    show(
      ({ "#planner": "plan", "#modules": "plan", "#blueprint": "bp" } as Record<string, TabId>)[
        location.hash
      ] ?? "calc",
    );
  return { show, showFromHash };
}
