import { pgTable, uuid, text, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// `tags` 注册业务标签。两条正交轴决定 tag 的语义:
//
//   mode ∈ {'list','assertion'} —— 封闭行为轴(成员怎么算出来)
//     - 'list'      → 名单标签:tag 的成员是一组实体清单(school / company / ...)。
//                     员工是否命中靠下游 JOIN 派生(经历 → entity_aliases → entities
//                     → tag_entity_map → tag)。挂载走 `tag link / unlink`,写
//                     tag_entity_map。
//     - 'assertion' → 判定标签:tag 是判决边界 prose,成员是员工清单。Agent 通读
//                     员工 profile 综合判决后挂载,走 `employee tag-add / tag-remove`,
//                     写 employee_tag_map。
//
//   kind ∈ {'school','company','skill','experience',...} —— 开放分类轴(tag 讲什么)
//     - 恒必填(NOT NULL)。
//     - 'list' 模式:kind 是挂哪类实体,对齐 entities.entity_type(school / company /
//                    未来 product / project / ...),取值开放,在 `tag link` 时撞 entity_type。
//     - 'assertion' 模式:kind 是判定的子类型,限 {skill(技能/方法论), experience(业务经验)}。
//
// 两条轴 + kind 的 mode 相关取值由下面两条 CHECK 约束强制(kind 必填由列的 NOT NULL 保证)。
export const tags = pgTable(
  "tags",
  {
    id: uuid().defaultRandom().primaryKey(),
    tagCode: text("tag_code").notNull().unique(),
    tagName: text("tag_name").notNull(),
    mode: text().notNull(),
    kind: text().notNull(),
    description: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_tags_mode_kind").on(t.mode, t.kind),
    check(
      "tags_mode_values",
      sql`${t.mode} IN ('list','assertion')`,
    ),
    // assertion 的 kind 限定闭集;list 的 kind 任意非空(= 某 entity_type)。
    check(
      "tags_assertion_kind_values",
      sql`${t.mode} <> 'assertion' OR ${t.kind} IN ('skill','experience')`,
    ),
  ],
);
