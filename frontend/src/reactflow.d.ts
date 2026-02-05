declare module "reactflow" {
  import * as React from "react";

  export type Node<T = any> = any;
  export type Edge<T = any> = any;
  export type NodeProps<T = any> = { data: T } & Record<string, unknown>;

  export const Background: React.FC<Record<string, unknown>>;
  export const Controls: React.FC<Record<string, unknown>>;
  export const MiniMap: React.FC<Record<string, unknown>>;
  export const Handle: React.FC<Record<string, unknown>>;
  export const Position: Record<string, unknown>;
  export const MarkerType: Record<string, unknown>;
  export const useNodesState: any;
  export const useEdgesState: any;

  const ReactFlow: React.FC<Record<string, unknown>>;
  export default ReactFlow;
}
