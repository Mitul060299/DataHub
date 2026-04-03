declare module "react-grid-layout" {
  export type Layout = { i: string; x: number; y: number; w: number; h: number; isResizable?: boolean; isDraggable?: boolean };
  export type Layouts = Record<string, Layout[]>;
  export const Responsive: any;
  export const WidthProvider: any;
  const ReactGridLayout: any;
  export default ReactGridLayout;
}
