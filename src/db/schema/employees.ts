import {
  pgTable,
  serial,
  text,
  date,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// 员工主表（1:1 per emp_id）。仅存稳定字段——高变化字段（dept/job_function 等）不入库，
// 需要时由 caller 自行从 source-of-truth 拉取。
//
// hr_status 是上游 HR 系统给的在职/离职状态原值（'A1' / '在职' / '离职' 等，上游怎么写就
// 存什么），下游消费方按需过滤。schema 不约束取值集合——保留上游原貌，避免 enum 一变 sync
// 整个挂掉。
export const employees = pgTable("employees", {
  empId: text("emp_id").primaryKey(),
  name: text().notNull(),
  hrStatus: text("hr_status"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// 员工工作经历（1:N per emp_id）。结构化字段，下游可与 entity_aliases JOIN 拿公司标签。
// companyName 入库走 normalizeName（与 entity_aliases.rawName 对称）。
export const employeeWorkExperiences = pgTable(
  "employee_work_experiences",
  {
    id: serial().primaryKey(),
    empId: text("emp_id")
      .notNull()
      .references(() => employees.empId, { onDelete: "cascade" }),
    companyName: text("company_name").notNull(),
    positionTitle: text("position_title"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    country: text(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_employee_work_exp_emp_id").on(t.empId)],
);

// 员工教育经历（1:N per emp_id）。结构化字段，school 入库走 normalizeName。
export const employeeEducations = pgTable(
  "employee_educations",
  {
    id: serial().primaryKey(),
    empId: text("emp_id")
      .notNull()
      .references(() => employees.empId, { onDelete: "cascade" }),
    school: text().notNull(),
    major: text(),
    degree: text(),
    education: text(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_employee_edu_emp_id").on(t.empId)],
);

// 员工简历（1:N per emp_id，多次入职 / 重新提交可能多条）。
// workList 是 raw JSON 字符串，含每段工作经历的 description / jobResp 等富文本。
// CLI 默认查询返回最新一条（ORDER BY updateTime DESC LIMIT 1）。
export const employeeResumes = pgTable(
  "employee_resumes",
  {
    id: serial().primaryKey(),
    empId: text("emp_id")
      .notNull()
      .references(() => employees.empId, { onDelete: "cascade" }),
    workList: text("work_list").notNull(),
    updateTime: timestamp("update_time", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_employee_resumes_emp_updated").on(
      t.empId,
      sql`update_time DESC`,
    ),
  ],
);
