import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { getEntityFn } from "~/server/entities";
import { GraphView, type GNode, type GEdge } from "~/components/graph";
import { Chip, EntityTypeDot } from "~/components/ui";

const CHILD_CAP = 30;

export const Route = createFileRoute("/graph/entity/$id")({
  loader: async ({ params }) => {
    const entity = await getEntityFn({ data: { id: params.id } });
    if (!entity) throw notFound();
    return entity;
  },
  component: EntityGraphPage,
});

function EntityGraphPage() {
  const e = Route.useLoaderData();
  const router = useRouter();

  const nodes: GNode[] = [];
  const edges: GEdge[] = [];

  // 祖先链(root→parent)→ self
  const chain = [...e.ancestors]; // root→parent 顺序
  chain.forEach((a) => {
    nodes.push({
      id: a.entityId,
      kind: "entity",
      label: a.canonicalName,
      entityType: e.entityType,
      href: `/graph/entity/${a.entityId}`,
    });
  });
  for (let i = 0; i < chain.length - 1; i++) {
    edges.push({
      id: `c-${chain[i].entityId}-${chain[i + 1].entityId}`,
      source: chain[i].entityId,
      target: chain[i + 1].entityId,
    });
  }
  // self
  nodes.push({
    id: e.entityId,
    kind: "entity",
    label: e.canonicalName,
    entityType: e.entityType,
    emphasis: true,
    href: `/entities/${e.entityId}`,
  });
  if (chain.length > 0) {
    edges.push({
      id: `c-${chain[chain.length - 1].entityId}-self`,
      source: chain[chain.length - 1].entityId,
      target: e.entityId,
    });
  }

  // 挂载标签 → self
  e.tags.forEach((t) => {
    const tid = `tag:${t.tagCode}`;
    nodes.push({
      id: tid,
      kind: "tag",
      label: t.tagCode,
      sub: t.tagName,
      href: `/tags/${t.tagCode}`,
    });
    edges.push({
      id: `t-${tid}`,
      source: tid,
      target: e.entityId,
      label: t.matchMode,
    });
  });

  // self → 子实体(截断)
  const children = e.children.slice(0, CHILD_CAP);
  children.forEach((c) => {
    nodes.push({
      id: c.entityId,
      kind: "entity",
      label: c.canonicalName,
      entityType: e.entityType,
      href: `/graph/entity/${c.entityId}`,
    });
    edges.push({
      id: `ch-${c.entityId}`,
      source: e.entityId,
      target: c.entityId,
    });
  });

  return (
    <div className="space-y-4">
      <div>
        <Link
          to="/entities/$id"
          params={{ id: e.entityId }}
          className="text-sm text-ink-3 underline-offset-2 hover:text-ink-2 hover:underline"
        >
          ← {e.canonicalName}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-[-0.012em] text-ink">
            {e.canonicalName}
          </h1>
          <Chip variant="neutral">
            <EntityTypeDot type={e.entityType} />
          </Chip>
          <span className="text-sm text-ink-3">层级 ↔ 标签图谱</span>
        </div>
        <p className="mt-1 text-xs text-ink-3">
          点击实体节点可跳到其图谱,点击标签节点到标签详情。
        </p>
      </div>
      {e.children.length > CHILD_CAP && (
        <p className="text-sm text-borderline">
          共 {e.children.length} 个子实体,图谱仅显示前 {CHILD_CAP} 个。
        </p>
      )}
      <GraphView
        nodes={nodes}
        edges={edges}
        onNavigate={(href) => router.history.push(href)}
      />
    </div>
  );
}
