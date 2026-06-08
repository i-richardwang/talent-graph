import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import type { DerivedTag } from "@db/queries/employees";
import {
  Chip,
  ConfidenceChip,
  Mono,
  Num,
  Panel,
} from "~/components/ui";

export const Route = createFileRoute("/employees/$empId")({
  loader: async ({ params }) => {
    const profile = await getProfile(params.empId);
    if (!profile) throw notFound();
    return profile;
  },
  component: EmployeeProfilePage,
});

// 抽出以便类型推断
import { getEmployeeProfileFn } from "~/server/employees";
function getProfile(empId: string) {
  return getEmployeeProfileFn({ data: { empId } });
}

function fmtRange(start: string | null, end: string | null) {
  if (!start && !end) return null;
  return `${start ?? "?"} → ${end ?? "至今"}`;
}

function EmployeeProfilePage() {
  const p = Route.useLoaderData();

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/employees"
          className="text-sm text-ink-3 underline-offset-2 hover:text-ink-2 hover:underline"
        >
          ← 员工
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-[-0.012em] text-ink">
            {p.name}
          </h1>
          <Mono className="text-ink-3">{p.empId}</Mono>
          {p.hrStatus && <Chip variant="neutral">{p.hrStatus}</Chip>}
        </div>
      </div>

      {/* 派生名单标签:经历 → 实体 → tag 的实时命中,带路径 */}
      <Panel
        title={
          <span className="flex items-center gap-2">
            派生名单标签
            <span className="font-mono text-ink-2">
              (<Num value={p.derivedTags.length} />)
            </span>
            <span className="font-normal normal-case tracking-normal text-ink-3">
              · 由经历实时 JOIN 派生
            </span>
          </span>
        }
      >
        {p.derivedTags.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-3">
            经历未命中任何名单标签(原始名未登记为别名,或所属实体未挂标签)。
          </p>
        ) : (
          <ul>
            {p.derivedTags.map((t) => (
              <DerivedTagRow key={t.tagId} tag={t} />
            ))}
          </ul>
        )}
      </Panel>

      {/* 判定标签:直接挂在档案上 */}
      <Panel
        title={
          <span className="flex items-center gap-2">
            判定标签
            <span className="font-mono text-ink-2">
              (<Num value={p.assertionTags.length} />)
            </span>
          </span>
        }
      >
        {p.assertionTags.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-3">未打任何判定标签。</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {p.assertionTags.map((t) => (
                <tr
                  key={t.tagId}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="px-4 py-2.5 align-top">
                    <Link
                      to="/tags/$code"
                      params={{ code: t.tagCode }}
                      className="font-mono text-accent-strong underline-offset-2 hover:underline"
                    >
                      {t.tagCode}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    <ConfidenceChip confidence={t.confidence} />
                  </td>
                  <td className="px-4 py-2.5 align-top text-ink-3 text-pretty">
                    {t.reasoning ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Panel
          title={
            <span className="flex items-center gap-2">
              工作经历
              <span className="font-mono text-ink-2">
                (<Num value={p.workExperience.length} />)
              </span>
            </span>
          }
        >
          {p.workExperience.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-3">无工作经历记录。</p>
          ) : (
            <ul>
              {p.workExperience.map((w) => (
                <li
                  key={w.id}
                  className="border-b border-border px-4 py-3 last:border-b-0"
                >
                  <div className="text-sm text-ink">{w.companyName}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-3">
                    {w.positionTitle && <span>{w.positionTitle}</span>}
                    {fmtRange(w.startDate, w.endDate) && (
                      <Mono>{fmtRange(w.startDate, w.endDate)}</Mono>
                    )}
                    {w.country && <span>{w.country}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title={
            <span className="flex items-center gap-2">
              教育经历
              <span className="font-mono text-ink-2">
                (<Num value={p.education.length} />)
              </span>
            </span>
          }
        >
          {p.education.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-3">无教育经历记录。</p>
          ) : (
            <ul>
              {p.education.map((ed) => (
                <li
                  key={ed.id}
                  className="border-b border-border px-4 py-3 last:border-b-0"
                >
                  <div className="text-sm text-ink">{ed.school}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-3">
                    {ed.degree && <span>{ed.degree}</span>}
                    {ed.major && <span>{ed.major}</span>}
                    {fmtRange(ed.startDate, ed.endDate) && (
                      <Mono>{fmtRange(ed.startDate, ed.endDate)}</Mono>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function DerivedTagRow({ tag }: { tag: DerivedTag }) {
  return (
    <li className="border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/tags/$code"
          params={{ code: tag.tagCode }}
          className="font-mono text-accent-strong underline-offset-2 hover:underline"
        >
          {tag.tagCode}
        </Link>
        <span className="text-sm text-ink-3">{tag.tagName}</span>
        <Chip mono>{tag.kind}</Chip>
      </div>
      {/* 命中路径:原始写法 → 标准实体 [→ 经由祖先 subtree] */}
      <div className="mt-1.5 space-y-1">
        {tag.paths.map((path, i) => (
          <div
            key={i}
            className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3"
          >
            <Mono className="text-ink-2">{path.rawName}</Mono>
            <span aria-hidden>→</span>
            <span className="text-ink-2">{path.originName}</span>
            {!path.direct && (
              <>
                <span aria-hidden>→</span>
                <span className="text-ink-2">{path.mountName}</span>
                <Chip variant="accent">subtree</Chip>
              </>
            )}
          </div>
        ))}
      </div>
    </li>
  );
}
