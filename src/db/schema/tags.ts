import { pgTable, uuid, text, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// `tags` 注册业务标签。两个正交字段决定 tag 的语义:
//
//   mode   ∈ {'list','assertion'}
//     - 'list'      → 名单标签:tag 的成员是一组实体清单(school / company / ...)。
//                     员工是否命中靠下游 JOIN 派生(经历 → entity_aliases → entities
//                     → tag_entity_map → tag)。挂载走 `tag link / unlink`,写
//                     tag_entity_map。
//     - 'assertion' → 判定标签:tag 是判决边界 prose,成员是员工清单。Agent 通读
//                     员工 profile 综合判决后挂载,走 `employee tag-add / tag-remove`,
//                     写 employee_tag_map。
//
//   domain ∈ {'school','company',...} 或 NULL
//     - 'list' 模式必填:tag 挂的是哪类实体(对齐 entities.entity_type)。
//     - 'assertion' 模式必为 NULL(判定标签不挂实体)。
//
// 二者由 CHECK 约束强制一致。
export const tags = pgTable(
  "tags",
  {
    id: uuid().defaultRandom().primaryKey(),
    tagCode: text("tag_code").notNull().unique(),
    tagName: text("tag_name").notNull(),
    mode: text().notNull(),
    domain: text(),
    description: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_tags_mode_domain").on(t.mode, t.domain),
    check(
      "tags_mode_values",
      sql`${t.mode} IN ('list','assertion')`,
    ),
    check(
      "tags_mode_domain_consistency",
      sql`(${t.mode} = 'list' AND ${t.domain} IS NOT NULL) OR (${t.mode} = 'assertion' AND ${t.domain} IS NULL)`,
    ),
  ],
);
