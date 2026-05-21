import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

// 破坏性操作的兜底审计表。仅记录物理删除 (tag unlink) 与覆盖式更新 (alias add --force);
// 正常 upsert / 新建不入表,避免当全量操作流水用。查错反查走 `talent-graph audit list`。
// 动作类型由 tableName 唯一确定——tag_entity_map / employee_tag_map 只被 delete,
// entity_aliases 只被 overwrite,不需要独立的 op 字段。
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().defaultRandom().primaryKey(),
    tableName: text("table_name").notNull(), // 'tag_entity_map' | 'employee_tag_map' | 'entity_aliases'
    beforeData: jsonb("before_data").notNull(), // 被删 / 被覆盖前的整行
    command: text(), // 触发的 CLI 调用,上下文回溯用
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_audit_log_table_created").on(t.tableName, t.createdAt)],
);
