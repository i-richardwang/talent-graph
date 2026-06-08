import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { listTagsFn } from "~/server/tags";
import { Chip, Num, PageHeader, TagModeChip } from "~/components/ui";

export const Route = createFileRoute("/tags/")({
  loader: () => listTagsFn({ data: {} }),
  component: TagsPage,
});

type ModeFilter = "all" | "list" | "assertion";

function TagsPage() {
  const tags = Route.useLoaderData();
  const [mode, setMode] = useState<ModeFilter>("all");
  const [kind, setKind] = useState<string | null>(null);

  const kinds = useMemo(
    () => [...new Set(tags.map((t) => t.kind))].sort(),
    [tags],
  );
  const shown = tags.filter(
    (t) => (mode === "all" || t.mode === mode) && (!kind || t.kind === kind),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="标签"
        subtitle={`名单标签维护实体清单,判定标签维护员工清单。共 ${tags.length} 个。`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <FilterGroup
          options={[
            { v: "all", label: "全部" },
            { v: "list", label: "名单 list" },
            { v: "assertion", label: "判定 assertion" },
          ]}
          value={mode}
          onChange={(v) => setMode(v as ModeFilter)}
        />
        {kinds.length > 1 && (
          <>
            <span className="mx-1 h-4 w-px bg-border" aria-hidden />
            <FilterGroup
              options={[
                { v: "", label: "全部分类" },
                ...kinds.map((k) => ({ v: k, label: k })),
              ]}
              value={kind ?? ""}
              onChange={(v) => setKind(v || null)}
            />
          </>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-sunken text-left text-xs uppercase tracking-[0.04em] text-ink-3">
              <th className="px-4 py-2.5 font-medium">代码</th>
              <th className="px-4 py-2.5 font-medium">名称</th>
              <th className="px-4 py-2.5 font-medium">模式</th>
              <th className="px-4 py-2.5 font-medium">分类</th>
              <th className="px-4 py-2.5 text-right font-medium">成员</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => (
              <tr
                key={t.tagId}
                className="group border-b border-border last:border-b-0 [@media(hover:hover)]:hover:bg-accent-tint"
              >
                <td className="px-4 py-2.5">
                  <Link
                    to="/tags/$code"
                    params={{ code: t.tagCode }}
                    className="font-mono text-accent-strong underline-offset-2 group-hover:underline"
                  >
                    {t.tagCode}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-ink">{t.tagName}</td>
                <td className="px-4 py-2.5">
                  <TagModeChip mode={t.mode} />
                </td>
                <td className="px-4 py-2.5">
                  <Chip mono>{t.kind}</Chip>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Num value={t.memberCount} className="text-ink" />
                  {t.mode === "assertion" && t.borderlineCount > 0 && (
                    <span className="ml-2 text-xs text-borderline">
                      +<Num value={t.borderlineCount} /> 边界
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink-3">
                  没有匹配的标签。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterGroup({
  options,
  value,
  onChange,
}: {
  options: { v: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={
            value === o.v
              ? "rounded-sm bg-accent-tint px-2.5 py-1 text-xs font-medium text-accent-strong"
              : "rounded-sm px-2.5 py-1 text-xs text-ink-2 transition-colors active:scale-[0.98] [@media(hover:hover)]:hover:bg-sunken"
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
