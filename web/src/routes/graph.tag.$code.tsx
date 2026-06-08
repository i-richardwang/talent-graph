import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { getTagFn, getTagMembersFn } from "~/server/tags";
import { GraphView, type GNode, type GEdge } from "~/components/graph";
import { Chip, TagModeChip } from "~/components/ui";

const CAP = 60;

export const Route = createFileRoute("/graph/tag/$code")({
  loader: async ({ params }) => {
    const tag = await getTagFn({ data: { codeOrId: params.code } });
    if (!tag) throw notFound();
    const members =
      tag.mode === "list"
        ? await getTagMembersFn({
            data: { codeOrId: params.code, limit: CAP },
          })
        : null;
    return { tag, members };
  },
  component: TagGraphPage,
});

function TagGraphPage() {
  const { tag, members } = Route.useLoaderData();
  const router = useRouter();

  let body;
  if (tag.mode === "assertion") {
    body = (
      <div className="flex h-[200px] items-center justify-center rounded-lg border border-border bg-surface px-6 text-center text-sm text-ink-3">
        判定标签的成员是员工,不进图谱(图谱只画 tag↔实体)。
        <br />
        到{" "}
        <Link
          to="/tags/$code"
          params={{ code: tag.tagCode }}
          className="text-accent-strong underline"
        >
          标签详情
        </Link>{" "}
        看员工成员。
      </div>
    );
  } else if (members && members.mode === "list") {
    const tagId = `tag:${tag.tagCode}`;
    const nodes: GNode[] = [
      {
        id: tagId,
        kind: "tag",
        label: tag.tagCode,
        sub: `${tag.tagName} · ${tag.kind}`,
        emphasis: true,
        href: `/tags/${tag.tagCode}`,
      },
      ...members.members.map((m) => ({
        id: m.entityId,
        kind: "entity" as const,
        label: m.canonicalName,
        entityType: m.entityType,
        href: `/entities/${m.entityId}`,
      })),
    ];
    const edges: GEdge[] = members.members.map((m) => ({
      id: `${tagId}-${m.entityId}`,
      source: tagId,
      target: m.entityId,
      label: m.matchMode,
    }));
    body = (
      <>
        {members.total > CAP && (
          <p className="text-sm text-borderline">
            共 {members.total} 个挂载实体,图谱仅显示前 {CAP} 个。
          </p>
        )}
        {members.members.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center rounded-lg border border-border bg-surface text-sm text-ink-3">
            该标签还没有挂载实体。
          </div>
        ) : (
          <GraphView
            nodes={nodes}
            edges={edges}
            onNavigate={(href) => router.history.push(href)}
          />
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Link
          to="/tags/$code"
          params={{ code: tag.tagCode }}
          className="text-sm text-ink-3 underline-offset-2 hover:text-ink-2 hover:underline"
        >
          ← {tag.tagCode}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-semibold tracking-[-0.012em] text-ink">
            {tag.tagCode}
          </h1>
          <TagModeChip mode={tag.mode} />
          <Chip mono>{tag.kind}</Chip>
          <span className="text-sm text-ink-3">标签 ↔ 实体图谱</span>
        </div>
      </div>
      {body}
    </div>
  );
}
