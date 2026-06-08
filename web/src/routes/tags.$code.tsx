import { createFileRoute, Link, notFound } from "@tanstack/react-router";
// 跨页链接到实体详情 / 员工档案(Phase 3 路由)
import { useState } from "react";
import { getTagFn, getTagMembersFn } from "~/server/tags";
import type { TagMembersResult } from "@db/queries/tags";
import {
  Chip,
  ConfidenceChip,
  EntityTypeDot,
  Mono,
  Num,
  Panel,
  TagModeChip,
} from "~/components/ui";

const PAGE = 50;

export const Route = createFileRoute("/tags/$code")({
  loader: async ({ params }) => {
    const tag = await getTagFn({ data: { codeOrId: params.code } });
    if (!tag) throw notFound();
    const members = await getTagMembersFn({
      data: { codeOrId: params.code, confidence: "confident", limit: PAGE },
    });
    return { tag, members };
  },
  component: TagDetailPage,
});

function TagDetailPage() {
  const { tag, members: initial } = Route.useLoaderData();

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/tags"
          className="text-sm text-ink-3 underline-offset-2 hover:text-ink-2 hover:underline"
        >
          ← 标签
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-semibold tracking-[-0.012em] text-ink">
            {tag.tagCode}
          </h1>
          <TagModeChip mode={tag.mode} />
          <Chip mono>{tag.kind}</Chip>
          {tag.mode === "list" && (
            <Link
              to="/graph/tag/$code"
              params={{ code: tag.tagCode }}
              className="ml-auto rounded-sm border border-border px-2.5 py-1 text-xs text-ink-2 transition-colors active:scale-[0.98] [@media(hover:hover)]:hover:bg-sunken"
            >
              查看图谱 →
            </Link>
          )}
        </div>
        <p className="mt-1.5 text-sm text-ink-2">{tag.tagName}</p>
        <div className="mt-3 flex items-center gap-4 text-sm text-ink-3">
          <span>
            成员 <Num value={tag.memberCount} className="text-ink" />
            {tag.mode === "list" ? " 个实体" : " 名(confident)"}
          </span>
          {tag.mode === "assertion" && (
            <span>
              边界 <Num value={tag.borderlineCount} className="text-borderline" />
            </span>
          )}
        </div>
      </div>

      <Panel title={tag.mode === "assertion" ? "判定边界 description" : "清单定义 description"}>
        <p className="whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed text-ink-2 text-pretty">
          {tag.description}
        </p>
      </Panel>

      <Members code={tag.tagCode} mode={tag.mode} initial={initial} />
    </div>
  );
}

function Members({
  code,
  mode,
  initial,
}: {
  code: string;
  mode: string;
  initial: TagMembersResult;
}) {
  const [data, setData] = useState<TagMembersResult>(initial);
  const [confidence, setConfidence] = useState<
    "confident" | "borderline" | "all"
  >("confident");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);

  async function refetch(
    nextConfidence: "confident" | "borderline" | "all",
    nextOffset: number,
  ) {
    setLoading(true);
    const res = await getTagMembersFn({
      data: { codeOrId: code, confidence: nextConfidence, limit: PAGE, offset: nextOffset },
    });
    setData(res);
    setConfidence(nextConfidence);
    setOffset(nextOffset);
    setLoading(false);
  }

  if (data.mode === "not_found") return null;

  const total = data.total;
  const title =
    mode === "assertion" ? "员工成员" : "挂载实体";

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          {title}
          <span className="font-mono text-ink-2">
            (<Num value={total} />)
          </span>
        </span>
      }
      actions={
        mode === "assertion" ? (
          <div className="flex items-center gap-1">
            {(["confident", "borderline", "all"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => refetch(c, 0)}
                className={
                  confidence === c
                    ? "rounded-sm bg-accent-tint px-2 py-1 text-xs font-medium text-accent-strong"
                    : "rounded-sm px-2 py-1 text-xs text-ink-2 [@media(hover:hover)]:hover:bg-sunken"
                }
              >
                {c}
              </button>
            ))}
          </div>
        ) : undefined
      }
    >
      {data.mode === "list" ? (
        <ListMembers members={data.members} />
      ) : (
        <AssertionMembers members={data.members} />
      )}

      {total > PAGE && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-sm">
          <span className="text-ink-3">
            {offset + 1}–{Math.min(offset + PAGE, total)} / <Num value={total} />
          </span>
          <div className="flex gap-2">
            <PagerButton
              disabled={offset === 0 || loading}
              onClick={() => refetch(confidence, Math.max(0, offset - PAGE))}
            >
              上一页
            </PagerButton>
            <PagerButton
              disabled={offset + PAGE >= total || loading}
              onClick={() => refetch(confidence, offset + PAGE)}
            >
              下一页
            </PagerButton>
          </div>
        </div>
      )}
    </Panel>
  );
}

function ListMembers({
  members,
}: {
  members: Extract<TagMembersResult, { mode: "list" }>["members"];
}) {
  if (members.length === 0)
    return <p className="px-4 py-6 text-sm text-ink-3">还没有挂载实体。</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs uppercase tracking-[0.04em] text-ink-3">
          <th className="px-4 py-2 font-medium">标准名</th>
          <th className="px-4 py-2 font-medium">类型</th>
          <th className="px-4 py-2 font-medium">匹配范围</th>
          <th className="px-4 py-2 font-medium">理由</th>
        </tr>
      </thead>
      <tbody>
        {members.map((m) => (
          <tr
            key={m.entityId}
            className="border-b border-border last:border-b-0 [@media(hover:hover)]:hover:bg-accent-tint"
          >
            <td className="px-4 py-2.5">
              <Link
                to="/entities/$id"
                params={{ id: m.entityId }}
                className="text-ink underline-offset-2 hover:text-accent-strong hover:underline"
              >
                {m.canonicalName}
              </Link>
            </td>
            <td className="px-4 py-2.5">
              <EntityTypeDot type={m.entityType} className="text-ink-2" />
            </td>
            <td className="px-4 py-2.5">
              <Chip variant={m.matchMode === "exact" ? "neutral" : "accent"}>
                {m.matchMode}
              </Chip>
            </td>
            <td className="px-4 py-2.5 text-ink-3">{m.reasoning ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AssertionMembers({
  members,
}: {
  members: Extract<TagMembersResult, { mode: "assertion" }>["members"];
}) {
  if (members.length === 0)
    return (
      <p className="px-4 py-6 text-sm text-ink-3">
        该置信度下还没有员工成员。判定标签由 /tag-employee 流水线写入。
      </p>
    );
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs uppercase tracking-[0.04em] text-ink-3">
          <th className="px-4 py-2 font-medium">员工</th>
          <th className="px-4 py-2 font-medium">置信度</th>
          <th className="px-4 py-2 font-medium">判决理由</th>
        </tr>
      </thead>
      <tbody>
        {members.map((m) => (
          <tr
            key={m.empId}
            className="border-b border-border last:border-b-0 [@media(hover:hover)]:hover:bg-accent-tint"
          >
            <td className="px-4 py-2.5">
              <Link
                to="/employees/$empId"
                params={{ empId: m.empId }}
                className="text-ink underline-offset-2 hover:text-accent-strong hover:underline"
              >
                {m.name}
              </Link>{" "}
              <Mono className="ml-1 text-ink-3">{m.empId}</Mono>
            </td>
            <td className="px-4 py-2.5">
              <ConfidenceChip confidence={m.confidence} />
            </td>
            <td className="max-w-md px-4 py-2.5 text-ink-3 text-pretty">
              {m.reasoning ?? "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PagerButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-sm border border-border px-2.5 py-1 text-ink-2 transition-[transform,background-color] duration-150 active:scale-[0.97] disabled:opacity-40 [@media(hover:hover)]:hover:bg-sunken"
    >
      {children}
    </button>
  );
}
