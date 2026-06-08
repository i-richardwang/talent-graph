import { createFileRoute } from "@tanstack/react-router";
import { getOverviewStatsFn } from "~/server/stats";
import {
  Chip,
  EntityTypeDot,
  Num,
  Panel,
  PageHeader,
  RuledRows,
  TagModeChip,
} from "~/components/ui";

export const Route = createFileRoute("/")({
  loader: () => getOverviewStatsFn(),
  component: OverviewPage,
});

function OverviewPage() {
  const stats = Route.useLoaderData();

  const figures = [
    { label: "标签", value: stats.tags.total },
    { label: "标准实体", value: stats.entities.total },
    { label: "员工", value: stats.employees.total },
    { label: "别名映射", value: stats.aliases.total },
    { label: "边界判定", value: stats.assertions.borderline },
  ];

  return (
    <div className="space-y-8">
      <PageHeader title="总览" subtitle="人才图谱当前数据规模与构成。" />

      {/* registry 条:发丝线分隔的关键计数,数字走 mono */}
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-5">
          {figures.map((f, i) => (
            <div
              key={f.label}
              className="rise bg-surface px-4 py-4 max-sm:last:col-span-2"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="text-xs uppercase tracking-[0.04em] text-ink-3">
                {f.label}
              </div>
              <Num
                value={f.value}
                className="mt-1.5 block text-[26px] leading-none tracking-[-0.022em] text-ink"
              />
              {f.label === "边界判定" && (
                <div className="mt-2 text-xs text-ink-3">
                  confident <Num value={stats.assertions.confident} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-3">
        <Panel title="标签 · 按模式">
          <RuledRows
            rows={stats.tags.byMode.map((r) => ({
              key: <TagModeChip mode={r.mode} />,
              value: <Num value={r.count} />,
            }))}
          />
        </Panel>

        <Panel title="标签 · 按分类">
          <RuledRows
            rows={stats.tags.byKind.map((r) => ({
              key: (
                <span className="flex items-center gap-2">
                  <TagModeChip mode={r.mode} />
                  <Chip mono>{r.kind}</Chip>
                </span>
              ),
              value: <Num value={r.count} />,
            }))}
          />
        </Panel>

        <Panel title="标准实体 · 按类型">
          <RuledRows
            rows={stats.entities.byType.map((r) => ({
              key: <EntityTypeDot type={r.entityType} className="text-ink-2" />,
              value: <Num value={r.count} />,
            }))}
          />
        </Panel>
      </div>
    </div>
  );
}
