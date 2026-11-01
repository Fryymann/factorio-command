// App entry: Calculator, Modules and Blueprint tabs (docs/migration.md, task 3).
import "./ui/styles.css";
import { mountBlueprint } from "./ui/blueprint.ts";
import { mountCalculator } from "./ui/calculator.ts";
import { mountModules } from "./ui/modules.ts";
import { mountTabs } from "./ui/tabs.ts";

let blueprint: ReturnType<typeof mountBlueprint> | undefined;
let modules: ReturnType<typeof mountModules> | undefined;
// The calculator mounts first so a malformed saved layout that makes the Modules mount throw
// can't blank the whole app (the artifact rendered the calculator before loading layouts).
mountCalculator(() => {
  modules?.sendFromCalc();
  tabs.show("plan");
});
modules = mountModules((nodeId) => {
  blueprint?.openModule(nodeId);
  tabs.show("bp");
});
blueprint = mountBlueprint();
const tabs = mountTabs((t) => {
  if (t === "plan") modules?.show();
  if (t === "bp") blueprint?.show();
});
tabs.showFromHash();
