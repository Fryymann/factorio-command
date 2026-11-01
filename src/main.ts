// App entry: Calculator, Modules and Blueprint tabs (docs/migration.md, task 3).
import "./ui/styles.css";
import { mountBlueprint } from "./ui/blueprint.ts";
import { mountCalculator } from "./ui/calculator.ts";
import { el, esc } from "./ui/common.ts";
import { mountModules } from "./ui/modules.ts";
import { mountTabs } from "./ui/tabs.ts";

// A malformed saved layout can make the Modules and Blueprint tabs throw. Report it on that tab
// and carry on, so the other tabs and the tab buttons still work (the artifact wired its tabs
// before loading layouts). Validating layouts on load is #15/#16.
function reportLayoutError(tab: string, warnId: string, e: unknown): void {
  console.error(`${tab} tab failed to load:`, e);
  el(warnId).innerHTML =
    `<div class="warnbox">${esc(`The ${tab} tab couldn't load your saved layouts: ${String(e)}. They were left untouched.`)}</div>`;
}

let blueprint: ReturnType<typeof mountBlueprint> | undefined;
let modules: ReturnType<typeof mountModules> | undefined;
// The calculator mounts first so a malformed saved layout can't blank the whole app (the
// artifact rendered the calculator before loading layouts).
mountCalculator(() => {
  modules?.sendFromCalc();
  tabs.show("plan");
});
try {
  modules = mountModules((nodeId) => {
    blueprint?.openModule(nodeId);
    tabs.show("bp");
  });
} catch (e) {
  reportLayoutError("Modules", "pl-warn", e);
}
blueprint = mountBlueprint();
const tabs = mountTabs((t) => {
  if (t === "plan") modules?.show();
  if (t === "bp") {
    try {
      blueprint?.show();
    } catch (e) {
      reportLayoutError("Blueprint", "bp-warn", e);
    }
  }
});
tabs.showFromHash();
