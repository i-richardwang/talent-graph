import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  unique,
  vector,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// 向量召回不建 hnsw/ivfflat 索引——本项目 entity 量级在千级以内,seq scan 精确且足够快;
// hnsw 是 ANN(近似最近邻)在小数据集上会漏召回真 top-1,适合百万级才上。

// `entity_type` 是 entity 子类(`school` / `company` / `product` / ...),开放扩展。
//
// `parent_id` 表达实体的从属层级(母子公司 / 母校附属机构等)。一个实体最多一个父
// (joint venture 这类需要多父的场景留给将来用边表升级)。tag_entity_map.match_mode
// = 'subtree' 时,JOIN 沿父链向上找祖先,实现"挂阿里巴巴的标也覆盖到菜鸟员工"。
export const entities = pgTable(
  "entities",
  {
    id: uuid().defaultRandom().primaryKey(),
    entityType: text("entity_type").notNull(),
    canonicalName: text("canonical_name").notNull(),
    description: text(),
    parentId: uuid("parent_id").references((): AnyPgColumn => entities.id, {
      onDelete: "set null",
    }),
    nameEmbedding: vector("name_embedding", { dimensions: 1024 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("uq_entities_type_name").on(t.entityType, t.canonicalName),
    index("idx_entities_type").on(t.entityType),
    index("idx_entities_parent").on(t.parentId),
  ],
);
