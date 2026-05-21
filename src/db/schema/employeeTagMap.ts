import { pgTable, uuid, text, timestamp, unique } from "drizzle-orm/pg-core";
import { tags } from "./tags";
import { employees } from "./employees";

// 判定标签 (`tags.mode = 'assertion'`) 的员工成员清单,通过
// `employee tag-add / tag-remove` 维护。Agent 通读员工 profile 综合判决后挂载。
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
    reasoning: text(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("uq_employee_tag").on(t.empId, t.tagId)],
);
