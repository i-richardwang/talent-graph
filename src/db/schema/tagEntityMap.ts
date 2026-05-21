import { pgTable, uuid, unique, timestamp, text, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tags } from "./tags";
import { entities } from "./entities";

// 名单标签(tags.mode='list')的实体挂载。每行 = 一个 (tag, entity) 关联。
//
// match_mode 决定下游 JOIN 时的传递性:
//   - 'exact'   → tag 仅命中此 entity 本身。
//   - 'subtree' → tag 命中此 entity 及其所有后代(沿 entities.parent_id 向下)。
//                 默认值,典型用例:互联网公司 tag 挂阿里巴巴(subtree),菜鸟员工
//                 走 raw_name → 菜鸟 entity → parent → 阿里巴巴 → 命中互联网公司。
//
// 例外用例:物流 tag 挂菜鸟(exact),只命中菜鸟员工,不向上把"阿里巴巴的所有员工"
// 都拉进物流。
export const tagEntityMap = pgTable(
  "tag_entity_map",
  {
    id: uuid().defaultRandom().primaryKey(),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    matchMode: text("match_mode").notNull().default("subtree"),
    reasoning: text(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("uq_tag_entity").on(t.tagId, t.entityId),
    check(
      "tag_entity_map_match_mode_values",
      sql`${t.matchMode} IN ('exact','subtree')`,
    ),
  ],
);
