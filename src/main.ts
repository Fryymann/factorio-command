// App entry: Calculator, Modules and Blueprint tabs (docs/migration.md, task 3).
import "./ui/styles.css";
import { mountBlueprint } from "./ui/blueprint.ts";
import { mountCalculator } from "./ui/calculator.ts";
import { mountModules } from "./ui/modules.ts";
import { mountTabs } from "./ui/tabs.ts";

let blueprint: ReturnType<typeof mountBlueprint> | undefined;
const modules = mountModules((nodeId) => {
  blueprint?.openModule(nodeId);
  tabs.show("bp");
});
blueprint = mountBlueprint();
const tabs = mountTabs((t) => {
  if (t === "plan") modules.show();
  if (t === "bp") blueprint?.show();
});
mountCalculator(() => {
  modules.sendFromCalc();
  tabs.show("plan");
});
tabs.showFromHash();
