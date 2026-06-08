import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { listEntitiesFn } from "~/server/entities";
import { Chip, EntityTypeDot, Num, PageHeader } from "~/components/ui";

const PAGE = 50;

interface Search {
  type?: string;
  q?: string;
  offset?: number;
}

export const Route = createFileRoute("/entities/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    type: typeof s.type === "string" && s.type ? s.type : undefined,
    q: typeof s.q === "string" && s.q ? s.q : undefined,
    offset: Number(s.offset) > 0 ? Number(s.offset) : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    listEntitiesFn({
      data: {
        type: deps.type,
        q: deps.q,
        limit: PAGE,
        offset: deps.offset ?? 0,
      },
    }),
  component: EntitiesPage,
});

const TYPES = [
  { v: "", label: "全部类型" },
  { v: "company", label: "company" },
  { v: "school", label: "school" },
];

function EntitiesPage() {
  const { rows, total } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [qInput, setQInput] = useState(search.q ?? "");
  const offset = search.offset ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="标准实体"
        subtitle={`公司 / 学校等标准实体,沿 parent_id 构成层级。命中 ${total.toLocaleString("en-US")} 个。`}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          {TYPES.map((t) => (
            <button
              key={t.v}
              type="button"
              onClick={() =>
                navigate({
                  search: { type: t.v || undefined, q: search.q },
                })
              }
              className={
                (search.type ?? "") === t.v
                  ? "rounded-sm bg-accent-tint px-2.5 py-1 text-xs font-medium text-accent-strong"
                  : "rounded-sm px-2.5 py-1 text-xs text-ink-2 transition-colors active:scale-[0.98] [@media(hover:hover)]:hover:bg-sunken"
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <form
          className="ml-auto flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ search: { type: search.type, q: qInput || undefined } });
          }}
        >
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="按标准名搜索…"
            className="w-56 rounded-md border border-border bg-surface px-3 py-1.5 text-sm outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-tint"
          />
          <button
            type="submit"
            className="rounded-sm bg-ink px-3 py-1.5 text-sm font-medium text-white transition-transform active:scale-[0.97]"
          >
            搜索
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-sunken text-left text-xs uppercase tracking-[0.04em] text-ink-3">
              <th className="px-4 py-2.5 font-medium">标准名</th>
              <th className="px-4 py-2.5 font-medium">类型</th>
              <th className="px-4 py-2.5 font-medium">隶属</th>
              <th className="px-4 py-2.5 text-right font-medium">别名</th>
              <th className="px-4 py-2.5 text-right font-medium">子实体</th>
              <th className="px-4 py-2.5 text-right font-medium">标签</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr
                key={e.entityId}
                className="group border-b border-border last:border-b-0 [@media(hover:hover)]:hover:bg-accent-tint"
              >
                <td className="px-4 py-2.5">
                  <Link
                    to="/entities/$id"
                    params={{ id: e.entityId }}
                    className="text-ink underline-offset-2 group-hover:text-accent-strong group-hover:underline"
                  >
                    {e.canonicalName}
                  </Link>
                </td>
                <td className="px-4 py-2.5">
                  <EntityTypeDot type={e.entityType} className="text-ink-2" />
                </td>
                <td className="px-4 py-2.5 text-ink-3">
                  {e.parentName ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Num value={e.aliasCount} className="text-ink-2" />
                </td>
                <td className="px-4 py-2.5 text-right">
                  {e.childCount > 0 ? (
                    <Num value={e.childCount} className="text-ink-2" />
                  ) : (
                    <span className="text-ink-3">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {e.tagCount > 0 ? (
                    <Chip variant="accent">{e.tagCount}</Chip>
                  ) : (
                    <span className="text-ink-3">—</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-3">
                  没有匹配的实体。
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {total > PAGE && (
          <div className="flex items-center justify-between border-t border-border bg-surface px-4 py-2.5 text-sm">
            <span className="text-ink-3">
              {offset + 1}–{Math.min(offset + PAGE, total)} /{" "}
              <Num value={total} />
            </span>
            <div className="flex gap-2">
              <Pager
                disabled={offset === 0}
                to={Math.max(0, offset - PAGE)}
                search={search}
                navigate={navigate}
              >
                上一页
              </Pager>
              <Pager
                disabled={offset + PAGE >= total}
                to={offset + PAGE}
                search={search}
                navigate={navigate}
              >
                下一页
              </Pager>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Pager({
  disabled,
  to,
  search,
  navigate,
  children,
}: {
  disabled: boolean;
  to: number;
  search: Search;
  navigate: ReturnType<typeof Route.useNavigate>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() =>
        navigate({ search: { ...search, offset: to || undefined } })
      }
      className="rounded-sm border border-border px-2.5 py-1 text-ink-2 transition-[transform,background-color] duration-150 active:scale-[0.97] disabled:opacity-40 [@media(hover:hover)]:hover:bg-sunken"
    >
      {children}
    </button>
  );
}
