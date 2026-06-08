import { sql } from "drizzle-orm";
import { db } from "../index";
import { normalizeName } from "../normalize";

// 实体层级浏览器(Phase 3)。12k+ 实体,必须分页 + 搜索,不全量返回。
// 列表带派生计数(别名/子实体/挂载 tag);详情带父链 breadcrumb + 直接子实体 + 别名 + tag。

export interface EntityListRow {
  entityId: string;
  entityType: string;
  canonicalName: string;
  parentId: string | null;
  parentName: string | null;
  aliasCount: number;
  childCount: number;
  tagCount: number;
}

export interface EntityListResult {
  rows: EntityListRow[];
  total: number;
}

export async function listEntities(opts: {
  type?: string;
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<EntityListResult> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const type = opts.type ?? null;
  // 搜索同样走 normalizeName,与入库归一对称(契约:下游匹配必须等价归一)
  const q = opts.q?.trim() ? `%${normalizeName(opts.q)}%` : null;

  const where = sql`
    (${type}::text IS NULL OR e.entity_type = ${type})
    AND (${q}::text IS NULL OR e.canonical_name ILIKE ${q})
  `;

  const rowsRes = await db.execute(sql`
    SELECT
      e.id AS entity_id,
      e.entity_type,
      e.canonical_name,
      e.parent_id,
      p.canonical_name AS parent_name,
      (SELECT count(*) FROM entity_aliases a WHERE a.entity_id = e.id)::int AS alias_count,
      (SELECT count(*) FROM entities c WHERE c.parent_id = e.id)::int AS child_count,
      (SELECT count(*) FROM tag_entity_map t WHERE t.entity_id = e.id)::int AS tag_count
    FROM entities e
    LEFT JOIN entities p ON p.id = e.parent_id
    WHERE ${where}
    ORDER BY e.canonical_name ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const totalRes = await db.execute(sql`
    SELECT count(*)::int AS total FROM entities e WHERE ${where}
  `);

  const rows: EntityListRow[] = (rowsRes.rows as Record<string, unknown>[]).map(
    (r) => ({
      entityId: r.entity_id as string,
      entityType: r.entity_type as string,
      canonicalName: r.canonical_name as string,
      parentId: (r.parent_id as string) ?? null,
      parentName: (r.parent_name as string) ?? null,
      aliasCount: r.alias_count as number,
      childCount: r.child_count as number,
      tagCount: r.tag_count as number,
    }),
  );

  return { rows, total: (totalRes.rows[0] as { total: number }).total };
}

export interface EntityDetail {
  entityId: string;
  entityType: string;
  canonicalName: string;
  description: string | null;
  ancestors: { entityId: string; canonicalName: string }[]; // 根→父,用于 breadcrumb
  children: { entityId: string; canonicalName: string }[];
  aliases: { rawName: string; reasoning: string | null }[];
  tags: { tagId: string; tagCode: string; tagName: string; matchMode: string }[];
}

export async function getEntity(id: string): Promise<EntityDetail | null> {
  const baseRes = await db.execute(sql`
    SELECT id, entity_type, canonical_name, description
    FROM entities WHERE id = ${id} LIMIT 1
  `);
  const base = baseRes.rows[0] as
    | { id: string; entity_type: string; canonical_name: string; description: string | null }
    | undefined;
  if (!base) return null;

  // 父链:沿 parent_id 向上,返回根→父顺序
  const ancRes = await db.execute(sql`
    WITH RECURSIVE chain AS (
      SELECT e.id, e.parent_id, e.canonical_name, 0 AS depth
      FROM entities e WHERE e.id = ${id}
      UNION ALL
      SELECT p.id, p.parent_id, p.canonical_name, chain.depth + 1
      FROM chain JOIN entities p ON p.id = chain.parent_id
    )
    SELECT id, canonical_name, depth FROM chain WHERE depth > 0 ORDER BY depth DESC
  `);

  const childRes = await db.execute(sql`
    SELECT id, canonical_name FROM entities WHERE parent_id = ${id}
    ORDER BY canonical_name ASC
  `);
  const aliasRes = await db.execute(sql`
    SELECT raw_name, reasoning FROM entity_aliases WHERE entity_id = ${id}
    ORDER BY created_at ASC
  `);
  const tagRes = await db.execute(sql`
    SELECT t.id AS tag_id, t.tag_code, t.tag_name, tem.match_mode
    FROM tag_entity_map tem JOIN tags t ON t.id = tem.tag_id
    WHERE tem.entity_id = ${id}
    ORDER BY t.tag_code ASC
  `);

  return {
    entityId: base.id,
    entityType: base.entity_type,
    canonicalName: base.canonical_name,
    description: base.description ?? null,
    ancestors: (ancRes.rows as Record<string, unknown>[]).map((r) => ({
      entityId: r.id as string,
      canonicalName: r.canonical_name as string,
    })),
    children: (childRes.rows as Record<string, unknown>[]).map((r) => ({
      entityId: r.id as string,
      canonicalName: r.canonical_name as string,
    })),
    aliases: (aliasRes.rows as Record<string, unknown>[]).map((r) => ({
      rawName: r.raw_name as string,
      reasoning: (r.reasoning as string) ?? null,
    })),
    tags: (tagRes.rows as Record<string, unknown>[]).map((r) => ({
      tagId: r.tag_id as string,
      tagCode: r.tag_code as string,
      tagName: r.tag_name as string,
      matchMode: r.match_mode as string,
    })),
  };
}
