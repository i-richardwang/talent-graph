import type { ReactNode } from "react";

// 技术档案册设计语言的共享原子组件。全站复用,见 web/DESIGN.md。
// 注意:Tailwind v4 会 purge 动态拼接的 class,所以所有 variant → 静态完整 class 串。

// ── 数据原子:code / ID / 数字 / 日期一律 mono + tabular-nums ──────────────

export function Mono({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`font-mono tabular-nums ${className}`}>{children}</span>
  );
}

export function Num({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {value.toLocaleString("en-US")}
    </span>
  );
}

// ── 语义 chip:tint 底 + 同色相文本,绝不灰字 ───────────────────────────

const CHIP_BASE =
  "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium leading-5 whitespace-nowrap";

const CHIP_VARIANT = {
  list: "bg-list-tint text-list",
  assertion: "bg-assertion-tint text-assertion",
  confident: "bg-confident-tint text-confident",
  borderline: "bg-borderline-tint text-borderline",
  accent: "bg-accent-tint text-accent-strong",
  neutral: "bg-sunken text-ink-2",
} as const;

export type ChipVariant = keyof typeof CHIP_VARIANT;

export function Chip({
  variant = "neutral",
  mono = false,
  children,
}: {
  variant?: ChipVariant;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`${CHIP_BASE} ${CHIP_VARIANT[variant]} ${mono ? "font-mono tabular-nums" : ""}`}
    >
      {children}
    </span>
  );
}

export function TagModeChip({ mode }: { mode: string }) {
  return mode === "assertion" ? (
    <Chip variant="assertion">判定 assertion</Chip>
  ) : (
    <Chip variant="list">名单 list</Chip>
  );
}

export function ConfidenceChip({ confidence }: { confidence: string }) {
  return confidence === "borderline" ? (
    <Chip variant="borderline">borderline</Chip>
  ) : (
    <Chip variant="confident">confident</Chip>
  );
}

// 实体类型圆点 + 名称(company/school 用语义色,其余中性)
const DOT_COLOR: Record<string, string> = {
  company: "bg-company",
  school: "bg-school",
};

export function EntityTypeDot({
  type,
  className = "",
}: {
  type: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span
        className={`size-1.5 rounded-full ${DOT_COLOR[type] ?? "bg-ink-3"}`}
        aria-hidden
      />
      <span>{type}</span>
    </span>
  );
}

// ── 容器:发丝线 panel,无阴影 ─────────────────────────────────────────

export function Panel({
  title,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-border bg-surface ${className}`}
    >
      {(title || actions) && (
        <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
          {title && (
            <h2 className="text-xs font-medium uppercase tracking-[0.04em] text-ink-3">
              {title}
            </h2>
          )}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

// 发丝线分隔的 key→value 行表(非斑马纹),数字右对齐
export function RuledRows({
  rows,
}: {
  rows: { key: ReactNode; value: ReactNode }[];
}) {
  if (rows.length === 0) {
    return <p className="px-4 py-3 text-sm text-ink-3">暂无数据</p>;
  }
  return (
    <dl>
      {rows.map((r, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-4 border-b border-border px-4 py-2.5 last:border-b-0 [@media(hover:hover)]:hover:bg-accent-tint"
        >
          <dt className="min-w-0 truncate text-sm text-ink-2">{r.key}</dt>
          <dd className="shrink-0 text-sm font-medium text-ink">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// 页头:标题 + 副标题
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.012em] text-balance">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}
