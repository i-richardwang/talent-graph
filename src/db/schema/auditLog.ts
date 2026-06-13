import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

// 破坏性操作的兜底审计表。记录物理删除 (tag unlink / alias remove / entity remove)
// 与覆盖式更新 (alias add --force);正常 upsert / 新建不入表,避免当全量操作流水用。
// 查错反查走 `talent-graph audit list`。tableName 标明被操作的表:tag_entity_map /
// employee_tag_map / entity_aliases / entities。entities 的 before_data 是复合快照
// (entity 行 + 级联删除的 aliases/tagLinks + 被孤儿化的 children),便于整体恢复。
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
