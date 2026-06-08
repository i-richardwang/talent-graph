import { and, eq, count, asc, or } from "drizzle-orm";
import { db } from "../index";
import {
  tags,
  tagEntityMap,
  employeeTagMap,
  entities,
  employees,
} from "../schema";

// 标签浏览器(Phase 2)的共享只读查询。memberCount 语义对齐 CLI:
//   - list 标签:挂载实体数(tag_entity_map 行数)
//   - assertion 标签:confident 成员数(borderlineCount 单列)

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TagListItem {
  tagId: string;
  tagCode: string;
  tagName: string;
  mode: string;
  kind: string;
  description: string;
  memberCount: number;
  borderlineCount: number; // assertion 才有意义,list 恒 0
}

export async function listTags(filter?: {
  mode?: string;
  kind?: string;
}): Promise<TagListItem[]> {
  const conditions = [];
  if (filter?.mode) conditions.push(eq(tags.mode, filter.mode));
  if (filter?.kind) conditions.push(eq(tags.kind, filter.kind));

  const rows = await db
    .select()
    .from(tags)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(tags.mode), asc(tags.kind), asc(tags.tagCode));

  const [entityCounts, empCounts] = await Promise.all([
    db
      .select({ tagId: tagEntityMap.tagId, count: count() })
      .from(tagEntityMap)
      .groupBy(tagEntityMap.tagId),
    db
      .select({
        tagId: employeeTagMap.tagId,
        confidence: employeeTagMap.confidence,
        count: count(),
      })
      .from(employeeTagMap)
      .groupBy(employeeTagMap.tagId, employeeTagMap.confidence),
  ]);

  const memberMap = new Map<string, number>();
  const borderlineMap = new Map<string, number>();
  for (const c of entityCounts) memberMap.set(c.tagId, c.count);
  for (const c of empCounts) {
    if (c.confidence === "borderline") borderlineMap.set(c.tagId, c.count);
    else memberMap.set(c.tagId, c.count);
  }

  return rows.map((r) => ({
    tagId: r.id,
    tagCode: r.tagCode,
    tagName: r.tagName,
    mode: r.mode,
    kind: r.kind,
    description: r.description,
    memberCount: memberMap.get(r.id) ?? 0,
    borderlineCount: borderlineMap.get(r.id) ?? 0,
  }));
}

async function resolveTag(codeOrId: string) {
  const [row] = await db
    .select()
    .from(tags)
    .where(
      UUID_RE.test(codeOrId)
        ? or(eq(tags.id, codeOrId), eq(tags.tagCode, codeOrId))
        : eq(tags.tagCode, codeOrId),
    )
    .limit(1);
  return row ?? null;
}

export async function getTag(codeOrId: string): Promise<TagListItem | null> {
  const tag = await resolveTag(codeOrId);
  if (!tag) return null;

  if (tag.mode === "assertion") {
    const counts = await db
      .select({ confidence: employeeTagMap.confidence, count: count() })
      .from(employeeTagMap)
      .where(eq(employeeTagMap.tagId, tag.id))
      .groupBy(employeeTagMap.confidence);
    return {
      tagId: tag.id,
      tagCode: tag.tagCode,
      tagName: tag.tagName,
      mode: tag.mode,
      kind: tag.kind,
      description: tag.description,
      memberCount: counts.find((c) => c.confidence === "confident")?.count ?? 0,
      borderlineCount:
        counts.find((c) => c.confidence === "borderline")?.count ?? 0,
    };
  }

  const [{ value }] = await db
    .select({ value: count() })
    .from(tagEntityMap)
    .where(eq(tagEntityMap.tagId, tag.id));
  return {
    tagId: tag.id,
    tagCode: tag.tagCode,
    tagName: tag.tagName,
    mode: tag.mode,
    kind: tag.kind,
    description: tag.description,
    memberCount: value,
    borderlineCount: 0,
  };
}

export interface ListTagMember {
  entityId: string;
  canonicalName: string;
  entityType: string;
  matchMode: string;
  reasoning: string | null;
}
export interface AssertionTagMember {
  empId: string;
  name: string;
  confidence: string;
  reasoning: string | null;
}

export type TagMembersResult =
  | {
      mode: "list";
      total: number;
      members: ListTagMember[];
    }
  | {
      mode: "assertion";
      total: number;
      confidenceFilter: "confident" | "borderline" | "all";
      members: AssertionTagMember[];
    }
  | { mode: "not_found" };

export async function getTagMembers(
  codeOrId: string,
  opts: {
    confidence?: "confident" | "borderline" | "all";
    limit?: number;
    offset?: number;
  } = {},
): Promise<TagMembersResult> {
  const tag = await resolveTag(codeOrId);
  if (!tag) return { mode: "not_found" };

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);

  if (tag.mode === "assertion") {
    const confidenceFilter = opts.confidence ?? "confident";
    const conditions = [eq(employeeTagMap.tagId, tag.id)];
    if (confidenceFilter !== "all") {
      conditions.push(eq(employeeTagMap.confidence, confidenceFilter));
    }
    const where = and(...conditions);
    const [members, [{ value: total }]] = await Promise.all([
      db
        .select({
          empId: employees.empId,
          name: employees.name,
          confidence: employeeTagMap.confidence,
          reasoning: employeeTagMap.reasoning,
        })
        .from(employeeTagMap)
        .innerJoin(employees, eq(employeeTagMap.empId, employees.empId))
        .where(where)
        .orderBy(asc(employees.name))
        .limit(limit)
        .offset(offset),
      db
        .select({ value: count() })
        .from(employeeTagMap)
        .where(where),
    ]);
    return { mode: "assertion", total, confidenceFilter, members };
  }

  const where = eq(tagEntityMap.tagId, tag.id);
  const [members, [{ value: total }]] = await Promise.all([
    db
      .select({
        entityId: entities.id,
        canonicalName: entities.canonicalName,
        entityType: entities.entityType,
        matchMode: tagEntityMap.matchMode,
        reasoning: tagEntityMap.reasoning,
      })
      .from(tagEntityMap)
      .innerJoin(entities, eq(tagEntityMap.entityId, entities.id))
      .where(where)
      .orderBy(asc(entities.canonicalName))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(tagEntityMap).where(where),
  ]);
  return { mode: "list", total, members };
}
