import {
  pgTable,
  uuid,
  text,
  timestamp,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tags } from "./tags";
import { employees } from "./employees";

// 判定标签 (`tags.mode = 'assertion'`) 的员工成员清单,通过
// `employee tag-add / tag-remove` 维护。Agent 通读员工 profile 综合判决后挂载。
//
// confidence 是判决置信度:每行都是"属于"的记录,只在置信度上分档。
//   - 'confident'  → 有把握命中(默认值)。
//   - 'borderline' → 大概率属于,但 tags.description 的边界对本人这个临界情形
//                    没划清(经历在,规则线模糊)。reasoning 里点名是哪条边界。
// 证据不足 / 不属于 → 根本不写本表(不是 borderline)。
// 下游"成员"语义默认只取 confident,borderline 需显式取(`tag members --confidence`);
// 同一 tag 反复出现 borderline 是该条 description 需业务方迭代的信号。
export const employeeTagMap = pgTable(
  "employee_tag_map",
  {
    id: uuid().defaultRandom().primaryKey(),
    empId: text("emp_id")
      .notNull()
      .references(() => employees.empId, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    confidence: text("confidence").notNull().default("confident"),
    reasoning: text(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("uq_employee_tag").on(t.empId, t.tagId),
    check(
      "employee_tag_map_confidence_values",
      sql`${t.confidence} IN ('confident','borderline')`,
    ),
  ],
);
