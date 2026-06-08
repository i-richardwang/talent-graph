import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { getEntityFn } from "~/server/entities";
import {
  Chip,
  EntityTypeDot,
  Mono,
  Num,
  Panel,
  RuledRows,
} from "~/components/ui";

export const Route = createFileRoute("/entities/$id")({
  loader: async ({ params }) => {
    const entity = await getEntityFn({ data: { id: params.id } });
    if (!entity) throw notFound();
    return entity;
  },
  component: EntityDetailPage,
});

function EntityDetailPage() {
  const e = Route.useLoaderData();

  return (
    <div className="space-y-6">
      {/* breadcrumb:实体类型入口 + 祖先链 */}
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-ink-3">
        <Link
          to="/entities"
          search={{ type: e.entityType }}
          className="underline-offset-2 hover:text-ink-2 hover:underline"
        >
          {e.entityType}
        </Link>
        {e.ancestors.map((a) => (
          <span key={a.entityId} className="flex items-center gap-1.5">
            <span className="text-ink-3">/</span>
            <Link
              to="/entities/$id"
              params={{ id: a.entityId }}
              className="underline-offset-2 hover:text-ink-2 hover:underline"
            >
              {a.canonicalName}
            </Link>
          </span>
        ))}
      </nav>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-[-0.012em] text-ink">
            {e.canonicalName}
          </h1>
          <Chip variant="neutral">
            <EntityTypeDot type={e.entityType} />
          </Chip>
          <Link
            to="/graph/entity/$id"
            params={{ id: e.entityId }}
            className="ml-auto rounded-sm border border-border px-2.5 py-1 text-xs text-ink-2 transition-colors active:scale-[0.98] [@media(hover:hover)]:hover:bg-sunken"
          >
            查看图谱 →
          </Link>
        </div>
        {e.description && (
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-2 text-pretty">
            {e.description}
          </p>
        )}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Panel
          title={
            <span className="flex items-center gap-2">
              挂载标签
              <span className="font-mono text-ink-2">
                (<Num value={e.tags.length} />)
              </span>
            </span>
          }
        >
          {e.tags.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-3">未挂任何名单标签。</p>
          ) : (
            <RuledRows
              rows={e.tags.map((t) => ({
                key: (
                  <span className="flex items-center gap-2">
                    <Link
                      to="/tags/$code"
                      params={{ code: t.tagCode }}
                      className="font-mono text-accent-strong underline-offset-2 hover:underline"
                    >
                      {t.tagCode}
                    </Link>
                    <span className="text-ink-3">{t.tagName}</span>
                  </span>
                ),
                value: (
                  <Chip variant={t.matchMode === "exact" ? "neutral" : "accent"}>
                    {t.matchMode}
                  </Chip>
                ),
              }))}
            />
          )}
        </Panel>

        <Panel
          title={
            <span className="flex items-center gap-2">
              子实体
              <span className="font-mono text-ink-2">
                (<Num value={e.children.length} />)
              </span>
            </span>
          }
        >
          {e.children.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-3">无直接子实体。</p>
          ) : (
            <RuledRows
              rows={e.children.map((c) => ({
                key: (
                  <Link
                    to="/entities/$id"
                    params={{ id: c.entityId }}
                    className="text-ink underline-offset-2 hover:text-accent-strong hover:underline"
                  >
                    {c.canonicalName}
                  </Link>
                ),
                value: <span className="text-ink-3">→</span>,
              }))}
            />
          )}
        </Panel>
      </div>

      <Panel
        title={
          <span className="flex items-center gap-2">
            别名(业务里见过的写法)
            <span className="font-mono text-ink-2">
              (<Num value={e.aliases.length} />)
            </span>
          </span>
        }
      >
        {e.aliases.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-3">尚未登记别名。</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {e.aliases.map((a, i) => (
                <tr
                  key={i}
                  className="border-b border-border last:border-b-0 [@media(hover:hover)]:hover:bg-accent-tint"
                >
                  <td className="px-4 py-2.5">
                    <Mono className="text-ink">{a.rawName}</Mono>
                  </td>
                  <td className="px-4 py-2.5 text-ink-3">{a.reasoning ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
