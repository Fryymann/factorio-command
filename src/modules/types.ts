// Saved module-graph shape (localStorage `fcp-layouts`), as written by artifacts/FCP_v1-2.html.

export interface MachineNode {
  id: string;
  kind: "machine";
  item: string;
  count: number | string;
  mach: string; // machine entity name, e.g. "assembling-machine-2"
}
export interface SourceNode {
  id: string;
  kind: "source";
  item: string;
  rate: number | string;
}
export interface OutputNode {
  id: string;
  kind: "output";
  item: null;
}
export type ModuleNode = MachineNode | SourceNode | OutputNode;

export interface ModuleEdge {
  id: string;
  from: string;
  to: string;
  belt: string; // belt entity name, e.g. "transport-belt"
}

export interface ModuleGraph {
  name: string;
  nodes: ModuleNode[];
  edges: ModuleEdge[];
}
