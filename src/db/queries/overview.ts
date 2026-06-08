import { count } from "drizzle-orm";
import { db } from "../index";
import {
  tags,
  entities,
  employees,
  entityAliases,
  employeeTagMap,
} from "../schema";

// 共享只读查询层 —— CLI 与 web/ server functions 都从这里取数,派生逻辑只写一处。
// 本文件是 web 总览页(Phase 1)的数据源:全部为聚合计数,不返回明细。

export interface OverviewStats {
  tags: {
    total: number;
    byMode: { mode: string; count: number }[];
    byKind: { mode: string; kind: string; count: number }[];
  };
  entities: {
    total: number;
    byType: { entityType: string; count: number }[];
  };
  employees: { total: number };
  aliases: { total: number };
  assertions: {
    confident: number;
    borderline: number;
  };
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const [
    tagsByMode,
    tagsByKind,
    entitiesByType,
    [{ value: employeeTotal }],
    [{ value: aliasTotal }],
    assertionsByConfidence,
  ] = await Promise.all([
    db
      .select({ mode: tags.mode, count: count() })
      .from(tags)
      .groupBy(tags.mode),
    db
      .select({ mode: tags.mode, kind: tags.kind, count: count() })
      .from(tags)
      .groupBy(tags.mode, tags.kind),
    db
      .select({ entityType: entities.entityType, count: count() })
      .from(entities)
      .groupBy(entities.entityType),
    db.select({ value: count() }).from(employees),
    db.select({ value: count() }).from(entityAliases),
    db
      .select({ confidence: employeeTagMap.confidence, count: count() })
      .from(employeeTagMap)
      .groupBy(employeeTagMap.confidence),
  ]);

  const tagTotal = tagsByMode.reduce((acc, r) => acc + r.count, 0);
  const entityTotal = entitiesByType.reduce((acc, r) => acc + r.count, 0);
  const confidenceMap = Object.fromEntries(
    assertionsByConfidence.map((r) => [r.confidence, r.count]),
  );

  return {
    tags: {
      total: tagTotal,
      byMode: tagsByMode
        .map((r) => ({ mode: r.mode, count: r.count }))
        .sort((a, b) => a.mode.localeCompare(b.mode)),
      byKind: tagsByKind
        .map((r) => ({ mode: r.mode, kind: r.kind, count: r.count }))
        .sort(
          (a, b) =>
            a.mode.localeCompare(b.mode) || a.kind.localeCompare(b.kind),
        ),
    },
    entities: {
      total: entityTotal,
      byType: entitiesByType
        .map((r) => ({ entityType: r.entityType, count: r.count }))
        .sort((a, b) => a.entityType.localeCompare(b.entityType)),
    },
    employees: { total: employeeTotal },
    aliases: { total: aliasTotal },
    assertions: {
      confident: confidenceMap["confident"] ?? 0,
      borderline: confidenceMap["borderline"] ?? 0,
    },
  };
}
