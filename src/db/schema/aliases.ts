import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";
import { entities } from "./entities";

// 原始名 → 标准实体的 mapping 表。一行 = 一条"这个写法就是这个实体"的判决。
// 下游消费侧按 (entity_type, raw_name) 精确等值 JOIN 命中。
export const entityAliases = pgTable(
  "entity_aliases",
  {
    id: uuid().defaultRandom().primaryKey(),
    entityType: text("entity_type").notNull(),
    rawName: text("raw_name").notNull(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    reasoning: text(),
    nameEmbedding: vector("name_embedding", { dimensions: 1024 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_entity_aliases_type_raw").on(t.entityType, t.rawName),
  ],
);
