import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";

// 标签↔实体图谱(Phase 4)。有界子图,结构性只含 tag + entity 两类节点,绝不画员工
// (entity 12k+ / employee 137k+,全量会糊死;员工命中永远走表格/档案)。

export type GraphNodeKind = "tag" | "entity";

export interface GNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  sub?: string; // tag: kind;entity: entityType
  entityType?: string;
  emphasis?: boolean; // 焦点节点高亮
  href?: string;
}
export interface GEdge {
  id: string;
  source: string;
  target: string;
  label?: string; // 通常是 match_mode
}

const NODE_W = 184;
const NODE_H = 56;

const DOT: Record<string, string> = {
  company: "bg-company",
  school: "bg-school",
};

function TagNodeView({ data }: NodeProps) {
  const d = data as unknown as GNode;
  return (
    <div
      className={`flex h-[56px] w-[184px] flex-col justify-center rounded-md border px-3 ${
        d.emphasis
          ? "border-accent bg-accent-tint"
          : "border-border bg-surface"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <div className="flex items-center gap-1.5">
        <span className="size-1.5 rounded-[2px] bg-accent" aria-hidden />
        <span className="truncate font-mono text-[13px] font-medium text-accent-strong">
          {d.label}
        </span>
      </div>
      {d.sub && (
        <span className="mt-0.5 truncate text-[11px] text-ink-3">{d.sub}</span>
      )}
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}

function EntityNodeView({ data }: NodeProps) {
  const d = data as unknown as GNode;
  return (
    <div
      className={`flex h-[56px] w-[184px] flex-col justify-center rounded-md border px-3 ${
        d.emphasis ? "border-ink bg-sunken" : "border-border bg-surface"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <span className="truncate text-[13px] text-ink">{d.label}</span>
      {d.entityType && (
        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-3">
          <span
            className={`size-1.5 rounded-full ${DOT[d.entityType] ?? "bg-ink-3"}`}
            aria-hidden
          />
          {d.entityType}
        </span>
      )}
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}

const nodeTypes = { tag: TagNodeView, entity: EntityNodeView };

function laidOut(nodes: GNode[], edges: GEdge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 28, ranksep: 64, marginx: 16, marginy: 16 });
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    return {
      id: n.id,
      type: n.kind,
      position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 },
      data: n as unknown as Record<string, unknown>,
    };
  });
}

export function GraphView({
  nodes,
  edges,
  onNavigate,
}: {
  nodes: GNode[];
  edges: GEdge[];
  onNavigate: (href: string) => void;
}) {
  // React Flow 依赖 DOM(ResizeObserver 等),SSR 阶段不渲染,挂载后再绘。
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const rfNodes = useMemo(() => laidOut(nodes, edges), [nodes, edges]);
  const rfEdges: Edge[] = useMemo(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        labelStyle: { fontSize: 11, fill: "oklch(0.48 0.011 255)" },
        labelBgStyle: { fill: "oklch(0.985 0.002 220)" },
        style: { stroke: "oklch(0.86 0.005 220)", strokeWidth: 1.5 },
      })),
    [edges],
  );

  if (!mounted) {
    return (
      <div className="flex h-[560px] items-center justify-center rounded-lg border border-border bg-surface text-sm text-ink-3">
        加载图谱…
      </div>
    );
  }

  return (
    <div className="h-[560px] overflow-hidden rounded-lg border border-border bg-canvas">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        fitView
        // 高扇出图(一个实体几十个子节点)会被 fitView 缩到看不清;
        // 给 fitView 设 minZoom 下限,节点保持可读,超宽时改为可平移而非缩成一团。
        fitViewOptions={{ minZoom: 0.45, maxZoom: 1.2, padding: 0.15 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={1.6}
        onNodeClick={(_, node) => {
          const href = (node.data as unknown as GNode).href;
          if (href) onNavigate(href);
        }}
      >
        <Background color="oklch(0.91 0.004 220)" gap={20} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
