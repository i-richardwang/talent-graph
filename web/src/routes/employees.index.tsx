import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { searchEmployeesFn } from "~/server/employees";
import { Mono, PageHeader } from "~/components/ui";

interface Search {
  q?: string;
}

export const Route = createFileRoute("/employees/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: typeof s.q === "string" && s.q ? s.q : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    deps.q ? searchEmployeesFn({ data: { q: deps.q, limit: 50 } }) : [],
  component: EmployeesPage,
});

function EmployeesPage() {
  const results = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [qInput, setQInput] = useState(search.q ?? "");

  return (
    <div className="space-y-6">
      <PageHeader
        title="员工"
        subtitle="按姓名或工号检索。员工命中名单标签靠经历实时派生,判定标签直接挂在档案上。"
      />

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          navigate({ search: { q: qInput || undefined } });
        }}
      >
        <input
          autoFocus
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="姓名或工号…"
          className="w-72 rounded-md border border-border bg-surface px-3 py-1.5 text-sm outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-tint"
        />
        <button
          type="submit"
          className="rounded-sm bg-ink px-3 py-1.5 text-sm font-medium text-white transition-transform active:scale-[0.97]"
        >
          搜索
        </button>
      </form>

      {!search.q ? (
        <p className="text-sm text-ink-3">输入姓名或工号开始检索。</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-sunken text-left text-xs uppercase tracking-[0.04em] text-ink-3">
                <th className="px-4 py-2.5 font-medium">姓名</th>
                <th className="px-4 py-2.5 font-medium">工号</th>
                <th className="px-4 py-2.5 font-medium">HR 状态</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr
                  key={r.empId}
                  className="group border-b border-border last:border-b-0 [@media(hover:hover)]:hover:bg-accent-tint"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      to="/employees/$empId"
                      params={{ empId: r.empId }}
                      className="text-ink underline-offset-2 group-hover:text-accent-strong group-hover:underline"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <Mono className="text-ink-2">{r.empId}</Mono>
                  </td>
                  <td className="px-4 py-2.5 text-ink-3">
                    {r.hrStatus ?? "—"}
                  </td>
                </tr>
              ))}
              {results.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-ink-3">
                    没有匹配「{search.q}」的员工。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
