#!/usr/bin/env node
import { config } from "dotenv";
// `quiet: true` 抑制 dotenv v17 的 "injected env / tip" 提示行——会污染 stdout 上
// 的 envelope JSON,导致 agent JSON.parse 失败。
config({ path: ".env.local", quiet: true });
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, or, ilike, sql, and } from "drizzle-orm";
import * as schema from "./db/schema";
import { normalizeName } from "./db/normalize";
import {
  emit,
  emitError,
  setCommand,
  getMode,
  serializeTag,
  serializeEntity,
  serializeAlias,
  serializeEmployee,
} from "./db/output";

const db = drizzle(process.env.DATABASE_URL!, { schema });

// 触发本次 CLI 的完整调用字符串,写进 audit_log.command 做回溯上下文。
const CLI_INVOCATION = ["talent-graph", ...process.argv.slice(2)].join(" ");

// ---------------------------------------------------------------------------
// CLI mode (readonly vs full)
// ---------------------------------------------------------------------------
//
// readonly (默认): 只暴露查询命令 + audit + diag。下游通用 / 搜索 / 推荐类 agent 用,
//   防止误调到 schema 改动命令。--help 也只列查询部分。
// full: 包含所有命令,供 agent 跑标准化任务、维护脚本(seed.sh)、CI 等显式开启写权限。
//
// 切换: export TALENT_GRAPH_MODE=full

const MODE = getMode();

// `<resource>.<action>` keys that mutate state. Used to reject calls in readonly
// mode and to filter the writeable section out of the default help output.
const MUTATING_ACTIONS = new Set<string>([
  "tag.add",
  "tag.link",
  "tag.unlink",
  "employee.tag-add",
  "employee.tag-remove",
  "entity.add",
  "alias.add",
  "embedding.backfill",
]);

// ---------------------------------------------------------------------------
// Arg helpers
// ---------------------------------------------------------------------------

function parseArgs(args: string[]): {
  flags: Record<string, string | boolean>;
  positionals: string[];
} {
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (!next || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      positionals.push(arg);
    }
  }
  return { flags, positionals };
}

type Flags = Record<string, string | boolean>;

function required(flags: Flags, key: string): string {
  const val = flags[key];
  if (val === undefined || val === true) {
    emitError("missing_option", { option: `--${key}` });
  }
  return val as string;
}

function optional(flags: Flags, key: string): string | undefined {
  const val = flags[key];
  if (val === undefined || val === true) return undefined;
  return val as string;
}

function flag(flags: Flags, key: string): boolean {
  return flags[key] === true;
}

function requirePositional(
  positionals: string[],
  index: number,
  command: string,
  hint: string,
): string {
  if (positionals.length <= index || !positionals[index]) {
    emitError("missing_positional", {
      command,
      argument: hint,
      hint: `Run without arguments to see usage.`,
    });
  }
  return positionals[index];
}

// 新建 entity 时的近义探测阈值:同 entity_type 内向量 similarity ≥ 此值即视作"疑似重复",
// 拦截插入并返回 suggestions;Agent 可传 --force-new 绕过。
// 高于 entity search 召回阈值,低于显见同名(≥0.95)。
const SUGGESTION_THRESHOLD = 0.85;

// entity search 的向量召回下限:低于此值视作噪音,不展示。
const VECTOR_SEARCH_MIN_SIMILARITY = 0.6;

// ---------------------------------------------------------------------------
// Embedding helpers
// ---------------------------------------------------------------------------

const EMBEDDING_BASE_URL = process.env.EMBEDDING_BASE_URL;
const EMBEDDING_API_KEY = process.env.EMBEDDING_API_KEY;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL;
const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS ?? "1024");

function isEmbeddingConfigured(): boolean {
  return !!(EMBEDDING_BASE_URL && EMBEDDING_MODEL);
}

type EmbeddingFetch =
  | { status: "ok"; vector: number[] }
  | { status: "unconfigured" }
  | { status: "api_failure"; reason: string };

async function getEmbedding(text: string): Promise<EmbeddingFetch> {
  if (!isEmbeddingConfigured()) return { status: "unconfigured" };

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (EMBEDDING_API_KEY) {
      headers.Authorization = `Bearer ${EMBEDDING_API_KEY}`;
    }
    const res = await fetch(`${EMBEDDING_BASE_URL}/embeddings`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text,
      }),
    });

    if (!res.ok) {
      return {
        status: "api_failure",
        reason: `Embedding API error: ${res.status} ${res.statusText}`,
      };
    }

    const json = (await res.json()) as { data: { embedding: number[] }[] };
    const embedding = json.data[0].embedding;

    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      return {
        status: "api_failure",
        reason: `Embedding dimension mismatch: got ${embedding.length}, expected ${EMBEDDING_DIMENSIONS}.`,
      };
    }

    return { status: "ok", vector: embedding };
  } catch (err) {
    return {
      status: "api_failure",
      reason: `Embedding API call failed: ${(err as Error).message}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Resolve helpers
// ---------------------------------------------------------------------------

interface SimilarEntitySuggestion {
  entityId: string;
  canonicalName: string;
  similarity: number;
  rawNames: string[];
}

type SimilarEntityProbeResult =
  | { status: "ran"; suggestions: SimilarEntitySuggestion[] }
  | { status: "unconfigured" }
  | { status: "api_failure"; reason: string };

/**
 * 在同 entity_type 内找向量近义的已有实体,作为 `entity add` 的第二路召回
 * (第一路是字面精确匹配,在 cmdEntityAdd 里独立跑、不依赖本函数)。
 *
 * 三种返回路径:
 * - status="ran" + suggestions: 配置可用且 similarity ≥ SUGGESTION_THRESHOLD 的候选(可能为空)
 * - status="unconfigured": EMBEDDING_* 未配 — caller 优雅降级,不当错
 * - status="api_failure": embedding API 调用失败 — caller 优雅降级,不当错
 *
 * 后两种是 caller 的多路召回中"这一路暂不可用",不是工具级故障:caller 跳过本路,
 * 仅靠字面精确匹配也能保住基本去重;遗漏的 fuzzy 重复留待 `embedding backfill` 恢复后
 * 由后续探测兜底,或人工通过 alias 合并。
 */
async function findSimilarEntities(
  entityType: string,
  queryText: string,
): Promise<SimilarEntityProbeResult> {
  if (!isEmbeddingConfigured()) return { status: "unconfigured" };

  const embeddingFetch = await getEmbedding(queryText);
  if (embeddingFetch.status === "unconfigured") return { status: "unconfigured" };
  if (embeddingFetch.status === "api_failure") {
    return { status: "api_failure", reason: embeddingFetch.reason };
  }

  const vectorLiteral = sql`${JSON.stringify(embeddingFetch.vector)}::vector`;
  const rows = await db.execute(sql`
    SELECT id, canonical_name,
           1 - (name_embedding <=> ${vectorLiteral}) AS similarity
    FROM entities
    WHERE entity_type = ${entityType} AND name_embedding IS NOT NULL
    ORDER BY name_embedding <=> ${vectorLiteral}
    LIMIT 3
  `);

  const candidates = rows.rows
    .map((r) => ({
      entityId: r.id as string,
      canonicalName: r.canonical_name as string,
      similarity: Number(Number(r.similarity).toFixed(4)),
    }))
    .filter((r) => r.similarity >= SUGGESTION_THRESHOLD);

  if (candidates.length === 0) return { status: "ran", suggestions: [] };

  const ids = candidates.map((c) => c.entityId);
  const rawNames = await db
    .select({
      entityId: schema.entityAliases.entityId,
      rawName: schema.entityAliases.rawName,
    })
    .from(schema.entityAliases)
    .where(or(...ids.map((id) => eq(schema.entityAliases.entityId, id))));

  const rawByEntity = new Map<string, string[]>();
  for (const r of rawNames) {
    const arr = rawByEntity.get(r.entityId) ?? [];
    arr.push(r.rawName);
    rawByEntity.set(r.entityId, arr);
  }

  return {
    status: "ran",
    suggestions: candidates.map((c) => ({
      ...c,
      rawNames: rawByEntity.get(c.entityId) ?? [],
    })),
  };
}

/**
 * 写 entity 的 name_embedding。失败留 NULL 给 `embedding backfill` 兜底,
 * api_failure 进 stderr [ops] 通道,Agent 不感知。
 */
async function writeEntityEmbedding(id: string, canonicalName: string) {
  const fetch = await getEmbedding(canonicalName);
  if (fetch.status === "ok") {
    await db.execute(
      sql`UPDATE entities SET name_embedding = ${JSON.stringify(fetch.vector)}::vector WHERE id = ${id}`,
    );
  } else if (fetch.status === "api_failure") {
    console.warn(
      `[ops] embedding write failed for entity "${canonicalName}" (${fetch.reason}); row inserted with NULL, run \`embedding backfill\` to retry.`,
    );
  }
}

async function writeAliasEmbedding(aliasId: string, rawName: string) {
  const fetch = await getEmbedding(rawName);
  if (fetch.status === "ok") {
    await db.execute(
      sql`UPDATE entity_aliases SET name_embedding = ${JSON.stringify(fetch.vector)}::vector WHERE id = ${aliasId}`,
    );
  } else if (fetch.status === "api_failure") {
    console.warn(
      `[ops] embedding write failed for alias "${rawName}" (${fetch.reason}); row inserted with NULL, run \`embedding backfill\` to retry.`,
    );
  }
  // unconfigured 静默 skip——是部署侧的有意配置,不属于异常。
}

// entities 全列减去 1536 维 nameEmbedding——列表 / 详情场景不需要把向量拉过 driver 再
// 在 serialize 层剥掉,白白走带宽和 JS 内存。只有相似度计算路径(findSimilarEntities /
// entity search 的 similar 子句)走 SQL,向量留在数据库里。
const ENTITY_COLUMNS = {
  id: schema.entities.id,
  entityType: schema.entities.entityType,
  canonicalName: schema.entities.canonicalName,
  description: schema.entities.description,
  parentId: schema.entities.parentId,
  createdAt: schema.entities.createdAt,
  updatedAt: schema.entities.updatedAt,
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveTag(codeOrId: string) {
  const key = normalizeName(codeOrId);
  const byCode = await db
    .select()
    .from(schema.tags)
    .where(eq(schema.tags.tagCode, key));
  if (byCode[0]) return byCode[0];
  if (!UUID_RE.test(key)) return null;
  const byId = await db
    .select()
    .from(schema.tags)
    .where(eq(schema.tags.id, key));
  return byId[0] ?? null;
}

// ---------------------------------------------------------------------------
// matchSource — entity search 命中来源的结构化表达
// ---------------------------------------------------------------------------
//
// Discriminated union:caller `if (m.kind === "alias")` 拿 m.rawName,不切字符串。

type MatchSource =
  | { kind: "canonical" }
  | { kind: "alias"; rawName: string };

function parseMatchedOn(raw: string): MatchSource {
  if (raw === "canonical_name") return { kind: "canonical" };
  if (raw.startsWith("raw_name:")) {
    return { kind: "alias", rawName: raw.slice("raw_name:".length) };
  }
  throw new Error(`unexpected matched_on value: ${raw}`);
}

// ---------------------------------------------------------------------------
// Commands — Diag (preflight)
// ---------------------------------------------------------------------------

async function cmdDiag() {
  let dbReachable = false;
  let vectorExtension = false;
  let dbError: string | null = null;

  try {
    await db.execute(sql`SELECT 1`);
    dbReachable = true;
    const ext = await db.execute(
      sql`SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS has_vector`,
    );
    vectorExtension = (ext.rows[0] as { has_vector: boolean })?.has_vector === true;
  } catch (err) {
    dbError = (err as Error).message;
  }

  const data = {
    database: { reachable: dbReachable, vectorExtension, error: dbError },
    embeddingConfigured: isEmbeddingConfigured(),
  };

  if (!dbReachable) return emitError("database_unreachable", data);
  if (!vectorExtension) return emitError("vector_extension_missing", data);
  return emit("ok", data);
}

// ---------------------------------------------------------------------------
// Commands — Query (entity)
// ---------------------------------------------------------------------------

async function cmdEntitySearch(rawQuery: string, opts: Flags) {
  const query = normalizeName(rawQuery);
  const entityType = required(opts, "type");
  const typeClause = sql`AND e.entity_type = ${entityType}`;
  const pattern = `%${query}%`;

  // exact 子句封顶 20:常见词("公司"/"university")可能命中千条,无界返回会让
  // envelope 体积爆炸。Agent 拿这一路是为了定位,不是穷举——超出说明 query 不够精确。
  const exactRows = await db.execute(sql`
    SELECT DISTINCT ON (e.id)
           e.id, e.entity_type, e.canonical_name, e.description,
           matched_on
    FROM (
      SELECT id, 'canonical_name' AS matched_on, 2 AS rank
      FROM entities WHERE canonical_name ILIKE ${pattern}
      UNION ALL
      SELECT entity_id AS id, 'raw_name:' || raw_name AS matched_on, 1 AS rank
      FROM entity_aliases WHERE raw_name ILIKE ${pattern}
    ) m
    JOIN entities e ON e.id = m.id
    WHERE true ${typeClause}
    ORDER BY e.id, rank DESC
    LIMIT 20
  `);

  const exactIds = exactRows.rows.map((r) => r.id as string);
  const attachedAliases =
    exactIds.length > 0
      ? await db
          .select({
            entityId: schema.entityAliases.entityId,
            rawName: schema.entityAliases.rawName,
          })
          .from(schema.entityAliases)
          .where(or(...exactIds.map((id) => eq(schema.entityAliases.entityId, id))))
      : [];
  const aliasesByEntity = new Map<string, string[]>();
  for (const a of attachedAliases) {
    const arr = aliasesByEntity.get(a.entityId) ?? [];
    arr.push(a.rawName);
    aliasesByEntity.set(a.entityId, arr);
  }

  // children: 直接子实体(parent_id 指向各 exact 命中),Agent 在判 raw 归属时一眼
  // 看到该实体下已注册的子主体——避免误把已存子 entity 的写法 alias 到母集团。
  // 不递归——只看一层,深层关系靠消费侧 JOIN。
  const childRows =
    exactIds.length > 0
      ? await db
          .select({
            parentId: schema.entities.parentId,
            entityId: schema.entities.id,
            canonicalName: schema.entities.canonicalName,
          })
          .from(schema.entities)
          .where(or(...exactIds.map((id) => eq(schema.entities.parentId, id))))
          .orderBy(schema.entities.canonicalName)
      : [];
  const childrenByEntity = new Map<
    string,
    Array<{ entityId: string; canonicalName: string }>
  >();
  for (const c of childRows) {
    if (!c.parentId) continue;
    const arr = childrenByEntity.get(c.parentId) ?? [];
    arr.push({ entityId: c.entityId, canonicalName: c.canonicalName });
    childrenByEntity.set(c.parentId, arr);
  }

  const exact = exactRows.rows.map((r) => ({
    entityId: r.id as string,
    entityType: r.entity_type as string,
    canonicalName: r.canonical_name as string,
    description: r.description as string | null,
    matchSource: parseMatchedOn(r.matched_on as string),
    rawNames: aliasesByEntity.get(r.id as string) ?? [],
    children: childrenByEntity.get(r.id as string) ?? [],
  }));

  // 第二路:语义相似召回。后端不可用时静默 skip(stderr 不刷,搜索调用频繁,
  // 每次都告警没意义;ops 看 `db diag` 一眼配置状态即可)。
  let similar: Array<{
    entityId: string;
    entityType: string;
    canonicalName: string;
    description: string | null;
    similarity: number;
    matchSource: MatchSource;
  }> = [];

  if (isEmbeddingConfigured()) {
    const fetched = await getEmbedding(query);
    if (fetched.status === "ok") {
      const vectorLiteral = sql`${JSON.stringify(fetched.vector)}::vector`;
      const similarRows = await db.execute(sql`
        SELECT * FROM (
          SELECT DISTINCT ON (e.id)
                 e.id, e.entity_type, e.canonical_name, e.description,
                 similarity, matched_on
          FROM (
            SELECT id, 1 - (name_embedding <=> ${vectorLiteral}) AS similarity,
                   'canonical_name' AS matched_on
            FROM entities WHERE name_embedding IS NOT NULL
            UNION ALL
            SELECT entity_id AS id, 1 - (name_embedding <=> ${vectorLiteral}) AS similarity,
                   'raw_name:' || raw_name AS matched_on
            FROM entity_aliases WHERE name_embedding IS NOT NULL
          ) m
          JOIN entities e ON e.id = m.id
          WHERE similarity > ${VECTOR_SEARCH_MIN_SIMILARITY} ${typeClause}
          ORDER BY e.id, similarity DESC
        ) per_entity_best
        ORDER BY similarity DESC
        LIMIT 10
      `);

      similar = similarRows.rows
        .map((r) => ({
          entityId: r.id as string,
          entityType: r.entity_type as string,
          canonicalName: r.canonical_name as string,
          description: r.description as string | null,
          similarity: Number(Number(r.similarity).toFixed(4)),
          matchSource: parseMatchedOn(r.matched_on as string),
        }))
        .sort((a, b) => b.similarity - a.similarity);
    }
    // unconfigured / api_failure → similar 留空,不向 caller 暴露后端原因
  }

  emit("ok", { query, entityType, exact, similar });
}

async function cmdEntityList(opts: Flags) {
  const entityType = optional(opts, "type");
  const q = db.select(ENTITY_COLUMNS).from(schema.entities).$dynamic();
  if (entityType) q.where(eq(schema.entities.entityType, entityType));
  const rows = await q;
  emit("ok", rows.map(serializeEntity));
}

// `entity get` — supports two input shapes:
//   talent-graph entity get <uuid>
//   talent-graph entity get <type> <canonical-name>
async function cmdEntityGet(positionals: string[]) {
  let entity: Omit<typeof schema.entities.$inferSelect, "nameEmbedding"> | undefined;

  if (positionals.length === 1 && UUID_RE.test(positionals[0])) {
    const id = positionals[0];
    [entity] = await db
      .select(ENTITY_COLUMNS)
      .from(schema.entities)
      .where(eq(schema.entities.id, id));
  } else if (positionals.length === 2) {
    const [entityType, rawName] = positionals;
    const canonicalName = normalizeName(rawName);
    [entity] = await db
      .select(ENTITY_COLUMNS)
      .from(schema.entities)
      .where(
        and(
          eq(schema.entities.entityType, entityType),
          eq(schema.entities.canonicalName, canonicalName),
        ),
      );
  } else {
    return emitError("usage_error", {
      hint: `Usage: entity get <uuid> | entity get <type> <canonical-name>`,
    });
  }

  if (!entity) {
    return emitError("entity_not_found", { positionals });
  }

  const aliases = await db
    .select({
      rawName: schema.entityAliases.rawName,
      reasoning: schema.entityAliases.reasoning,
    })
    .from(schema.entityAliases)
    .where(eq(schema.entityAliases.entityId, entity.id))
    .orderBy(schema.entityAliases.createdAt);

  const tagLinks = await db
    .select({
      tagId: schema.tags.id,
      tagCode: schema.tags.tagCode,
      tagName: schema.tags.tagName,
      matchMode: schema.tagEntityMap.matchMode,
      reasoning: schema.tagEntityMap.reasoning,
    })
    .from(schema.tagEntityMap)
    .innerJoin(schema.tags, eq(schema.tagEntityMap.tagId, schema.tags.id))
    .where(eq(schema.tagEntityMap.entityId, entity.id));

  // children: 直接子实体(parent_id 指向 entity.id),便于 Agent 维护层级时一眼
  // 看到这个实体下挂了什么。不递归——递归视图属于消费侧 JOIN(用 recursive CTE)。
  const children = await db
    .select({
      entityId: schema.entities.id,
      canonicalName: schema.entities.canonicalName,
    })
    .from(schema.entities)
    .where(eq(schema.entities.parentId, entity.id))
    .orderBy(schema.entities.canonicalName);

  emit("ok", {
    ...serializeEntity(entity),
    aliases,
    children,
    tags: tagLinks,
  });
}

// ---------------------------------------------------------------------------
// Commands — Query (tag)
// ---------------------------------------------------------------------------

async function cmdTagList(opts: Flags) {
  const mode = optional(opts, "mode");
  const domain = optional(opts, "domain");
  const conditions = [];
  if (mode) conditions.push(eq(schema.tags.mode, mode));
  if (domain) conditions.push(eq(schema.tags.domain, domain));
  const q = db.select().from(schema.tags).$dynamic();
  if (conditions.length > 0) q.where(and(...conditions));
  const rows = await q;

  // 名单标签 (mode='list') 的成员落 tag_entity_map,判定标签 (mode='assertion')
  // 的成员落 employee_tag_map。同一 tagId 由 mode 唯一决定挂在哪张表,countMap
  // 顺序覆盖即可,不会冲突。
  const [entityCounts, empCounts] = await Promise.all([
    db
      .select({
        tagId: schema.tagEntityMap.tagId,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.tagEntityMap)
      .groupBy(schema.tagEntityMap.tagId),
    db
      .select({
        tagId: schema.employeeTagMap.tagId,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.employeeTagMap)
      .groupBy(schema.employeeTagMap.tagId),
  ]);
  const countMap = new Map<string, number>();
  for (const c of entityCounts) countMap.set(c.tagId, c.count);
  for (const c of empCounts) countMap.set(c.tagId, c.count);

  const data = rows.map((r) => ({
    ...serializeTag(r),
    memberCount: countMap.get(r.id) ?? 0,
  }));

  emit("ok", data);
}

async function cmdTagGet(codeOrId: string) {
  const tag = await resolveTag(codeOrId);
  if (!tag) {
    return emitError("tag_not_found", { tagRef: codeOrId });
  }
  // mode 决定 count 哪张表 (list → tag_entity_map,assertion → employee_tag_map)。
  const memberTable =
    tag.mode === "assertion" ? schema.employeeTagMap : schema.tagEntityMap;
  const [{ count: memberCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(memberTable)
    .where(eq(memberTable.tagId, tag.id));

  emit("ok", { ...serializeTag(tag), memberCount });
}

// `tag members` — return who/what is attached to a tag. Response shape varies
// by tag mode:
//   - 判定标签 (mode='assertion') → `members: [{ empId, name, reasoning }]`
//   - 名单标签 (mode='list')      → `members: [{ entityId, canonicalName, description,
//                                    matchMode, reasoning }]`
async function cmdTagMembers(codeOrId: string) {
  const tag = await resolveTag(codeOrId);
  if (!tag) {
    return emitError("tag_not_found", { tagRef: codeOrId });
  }

  if (tag.mode === "assertion") {
    const members = await db
      .select({
        empId: schema.employees.empId,
        name: schema.employees.name,
        reasoning: schema.employeeTagMap.reasoning,
      })
      .from(schema.employeeTagMap)
      .innerJoin(
        schema.employees,
        eq(schema.employeeTagMap.empId, schema.employees.empId),
      )
      .where(eq(schema.employeeTagMap.tagId, tag.id))
      .orderBy(schema.employees.name);
    return emit("ok", {
      tagId: tag.id,
      tagCode: tag.tagCode,
      mode: tag.mode,
      domain: tag.domain,
      members,
    });
  }

  const members = await db
    .select({
      entityId: schema.entities.id,
      canonicalName: schema.entities.canonicalName,
      description: schema.entities.description,
      matchMode: schema.tagEntityMap.matchMode,
      reasoning: schema.tagEntityMap.reasoning,
    })
    .from(schema.tagEntityMap)
    .innerJoin(
      schema.entities,
      eq(schema.tagEntityMap.entityId, schema.entities.id),
    )
    .where(eq(schema.tagEntityMap.tagId, tag.id))
    .orderBy(schema.entities.canonicalName);
  emit("ok", {
    tagId: tag.id,
    tagCode: tag.tagCode,
    mode: tag.mode,
    domain: tag.domain,
    members,
  });
}

async function cmdAliasList(opts: Flags) {
  const entityType = optional(opts, "type");
  const entityId = optional(opts, "entity");
  const rawNameRaw = optional(opts, "raw-name");
  const rawName = rawNameRaw ? normalizeName(rawNameRaw) : undefined;

  const conditions = [];
  if (entityType)
    conditions.push(eq(schema.entityAliases.entityType, entityType));
  if (entityId)
    conditions.push(eq(schema.entityAliases.entityId, entityId));
  if (rawName)
    conditions.push(eq(schema.entityAliases.rawName, rawName));

  const select = {
    id: schema.entityAliases.id,
    entityType: schema.entityAliases.entityType,
    rawName: schema.entityAliases.rawName,
    entityId: schema.entityAliases.entityId,
    reasoning: schema.entityAliases.reasoning,
    createdAt: schema.entityAliases.createdAt,
    updatedAt: schema.entityAliases.updatedAt,
  };

  const q = db.select(select).from(schema.entityAliases).$dynamic();
  if (conditions.length > 0) q.where(and(...conditions));
  const rows = await q;

  emit("ok", rows.map(serializeAlias));
}

// ---------------------------------------------------------------------------
// Commands — Register (upsert)
// ---------------------------------------------------------------------------

async function cmdEntityAdd(opts: Flags) {
  const entityType = normalizeName(required(opts, "type"));
  const canonicalName = normalizeName(required(opts, "canonical-name"));
  const description = optional(opts, "description") ?? null;
  const parentIdOpt = optional(opts, "parent");
  const forceNew = flag(opts, "force-new");

  // parent 必须存在且 entity_type 一致——同域分区是层级的硬约束(school 不会作为
  // company 的父),否则 subtree 匹配会跨域漂移。
  if (parentIdOpt) {
    const [parent] = await db
      .select({
        id: schema.entities.id,
        entityType: schema.entities.entityType,
      })
      .from(schema.entities)
      .where(eq(schema.entities.id, parentIdOpt));
    if (!parent) {
      return emitError("entity_not_found", {
        entityId: parentIdOpt,
        hint: "--parent 引用的实体不存在。",
      });
    }
    if (parent.entityType !== entityType) {
      return emitError("cross_domain_rejected", {
        flagEntityType: entityType,
        parentEntityId: parent.id,
        parentEntityType: parent.entityType,
        hint: "父子实体必须同 entity_type(同域分区是层级的硬约束)。",
      });
    }
  }

  // 第一路:精确重名 → 幂等 reuse
  const [exactExisting] = await db
    .select(ENTITY_COLUMNS)
    .from(schema.entities)
    .where(
      and(
        eq(schema.entities.entityType, entityType),
        eq(schema.entities.canonicalName, canonicalName),
      ),
    );
  if (exactExisting) {
    return emit("already_exists", serializeEntity(exactExisting));
  }

  // 第二路:语义相似命中 → 返 `similar_exists` 让 caller 看 suggestions 决策。
  // 后端不可用 / 配置缺失时静默降级,写入照常;ops 看 stderr / `db diag`,
  // 不向 caller envelope 暴露后端原因——caller 不该被卷进基础设施诊断。
  if (!forceNew) {
    const probe = await findSimilarEntities(entityType, canonicalName);
    if (probe.status === "api_failure") {
      console.warn(
        `[ops] similarity check unavailable for "${canonicalName}" (${probe.reason}); insert proceeded.`,
      );
    } else if (probe.status === "ran" && probe.suggestions.length > 0) {
      return emitError("similar_exists", {
        incoming: { entityType, canonicalName },
        threshold: SUGGESTION_THRESHOLD,
        suggestions: probe.suggestions,
        hint: "Reuse one of suggestions[].entityId, adjust canonicalName, or pass --force-new if genuinely distinct.",
      });
    }
  }

  const [row] = await db
    .insert(schema.entities)
    .values({
      entityType,
      canonicalName,
      description,
      parentId: parentIdOpt ?? null,
    })
    .returning(ENTITY_COLUMNS);
  await writeEntityEmbedding(row.id, canonicalName);

  emit("created", serializeEntity(row));
}

async function cmdTagAdd(opts: Flags) {
  const tagCode = normalizeName(required(opts, "code"));
  const tagName = normalizeName(required(opts, "name"));
  const mode = required(opts, "mode");
  const domainRaw = optional(opts, "domain");
  const domain = domainRaw ? normalizeName(domainRaw) : null;
  const description = required(opts, "description");

  if (mode !== "list" && mode !== "assertion") {
    return emitError("usage_error", {
      hint: "--mode 必须是 'list'(名单标签)或 'assertion'(判定标签)。",
    });
  }
  if (mode === "list" && !domain) {
    return emitError("usage_error", {
      hint: "名单标签 (--mode list) 必须给 --domain(挂哪类实体,对齐 entities.entity_type)。",
    });
  }
  if (mode === "assertion" && domain) {
    return emitError("usage_error", {
      hint: "判定标签 (--mode assertion) 不挂实体,不要给 --domain。",
    });
  }
  if (description.trim().length === 0) {
    return emitError("usage_error", {
      hint: "tag.description 是判决边界 prose,不能为空字符串或纯空白。",
    });
  }

  // 名单标签 (mode='list'):tag 是实体清单,挂载走 `tag link / unlink`。
  // 判定标签 (mode='assertion'):tag 是员工清单,挂载走 `employee tag-add / tag-remove`。
  const [existing] = await db
    .select()
    .from(schema.tags)
    .where(eq(schema.tags.tagCode, tagCode));

  if (existing) {
    if (existing.mode !== mode || existing.domain !== domain) {
      return emitError("tag_mode_conflict", {
        tagCode,
        existing: { mode: existing.mode, domain: existing.domain },
        incoming: { mode, domain },
        hint: "mode 与 domain 是 tag 的身份分区,不可变更(包括 list ↔ assertion 互转、跨 domain 改挂)。请改用新的 tag_code,或先删除旧 tag。",
      });
    }
    return emit("already_exists", serializeTag(existing));
  }

  const [row] = await db
    .insert(schema.tags)
    .values({ tagCode, tagName, mode, domain, description })
    .returning();
  emit("created", serializeTag(row));
}

// ---------------------------------------------------------------------------
// Commands — 名单标签的实体清单维护(写 tag_entity_map)
// ---------------------------------------------------------------------------
//
// 判定标签(打员工)走 `employee tag-add / tag-remove`,见下文 employee 命令组。

async function cmdTagLink(opts: Flags) {
  const tagRef = normalizeName(required(opts, "tag"));
  const entityId = required(opts, "entity");
  const reasoning = optional(opts, "reasoning");
  const matchModeOpt = optional(opts, "match-mode");
  const matchMode = matchModeOpt ?? "subtree";

  if (matchMode !== "exact" && matchMode !== "subtree") {
    return emitError("usage_error", {
      hint: "--match-mode 必须是 'exact'(只命中此实体)或 'subtree'(含所有后代,默认)。",
    });
  }

  const tag = await resolveTag(tagRef);
  if (!tag) return emitError("tag_not_found", { tagRef });

  if (tag.mode === "assertion") {
    return emitError("wrong_tag_mode", {
      tagId: tag.id,
      tagCode: tag.tagCode,
      tagMode: tag.mode,
      hint: "这是判定标签 (mode='assertion'),不维护实体清单。给员工挂标用 `employee tag-add --emp <emp_id> --tag <code>`。",
    });
  }

  const [entity] = await db
    .select({
      id: schema.entities.id,
      entityType: schema.entities.entityType,
    })
    .from(schema.entities)
    .where(eq(schema.entities.id, entityId));
  if (!entity) return emitError("entity_not_found", { entityId });

  if (entity.entityType !== tag.domain) {
    return emitError("cross_domain_rejected", {
      tagId: tag.id,
      tagCode: tag.tagCode,
      tagDomain: tag.domain,
      entityId,
      entityEntityType: entity.entityType,
      hint: "跨任务域链接被拒绝(tag.domain 必须等于 entity.entity_type)。",
    });
  }

  const [existing] = await db
    .select({
      id: schema.tagEntityMap.id,
      matchMode: schema.tagEntityMap.matchMode,
    })
    .from(schema.tagEntityMap)
    .where(
      and(
        eq(schema.tagEntityMap.tagId, tag.id),
        eq(schema.tagEntityMap.entityId, entityId),
      ),
    );
  if (existing) {
    // matchMode 与现状一致 → 幂等 already_linked;不一致 → 当作"改判"用 update,
    // 不进 audit_log(matchMode 不是破坏性变更,而是同一挂载关系的属性微调)。
    if (existing.matchMode === matchMode) {
      return emit("already_linked", {
        tagId: tag.id,
        entityId,
        matchMode: existing.matchMode,
      });
    }
    await db
      .update(schema.tagEntityMap)
      .set({ matchMode })
      .where(eq(schema.tagEntityMap.id, existing.id));
    return emit("match_mode_updated", {
      tagId: tag.id,
      entityId,
      matchMode,
      previous: existing.matchMode,
    });
  }

  await db
    .insert(schema.tagEntityMap)
    .values({ tagId: tag.id, entityId, matchMode, reasoning });
  emit("linked", { tagId: tag.id, entityId, matchMode });
}

async function cmdTagUnlink(opts: Flags) {
  const tagRef = normalizeName(required(opts, "tag"));
  const entityId = required(opts, "entity");

  const tag = await resolveTag(tagRef);
  if (!tag) return emitError("tag_not_found", { tagRef });

  if (tag.mode === "assertion") {
    return emitError("wrong_tag_mode", {
      tagId: tag.id,
      tagCode: tag.tagCode,
      tagMode: tag.mode,
      hint: "这是判定标签 (mode='assertion'),不维护实体清单。撤员工标用 `employee tag-remove --emp <emp_id> --tag <code>`。",
    });
  }

  const removed = await db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(schema.tagEntityMap)
      .where(
        and(
          eq(schema.tagEntityMap.tagId, tag.id),
          eq(schema.tagEntityMap.entityId, entityId),
        ),
      );
    if (!target) return null;

    await tx.insert(schema.auditLog).values({
      tableName: "tag_entity_map",
      beforeData: target,
      command: CLI_INVOCATION,
    });
    await tx
      .delete(schema.tagEntityMap)
      .where(eq(schema.tagEntityMap.id, target.id));
    return target;
  });

  if (!removed) {
    return emit("not_linked", { tagId: tag.id, entityId });
  }
  emit("unlinked", { tagId: tag.id, entityId });
}

// ---------------------------------------------------------------------------
// Commands — 判定标签的员工挂载维护(写 employee_tag_map)
// ---------------------------------------------------------------------------

async function cmdEmployeeTagAdd(opts: Flags) {
  const empId = required(opts, "emp");
  const tagRef = normalizeName(required(opts, "tag"));
  const reasoning = optional(opts, "reasoning");

  const tag = await resolveTag(tagRef);
  if (!tag) return emitError("tag_not_found", { tagRef });

  if (tag.mode !== "assertion") {
    return emitError("wrong_tag_mode", {
      tagId: tag.id,
      tagCode: tag.tagCode,
      tagMode: tag.mode,
      tagDomain: tag.domain,
      hint: `这是名单标签(挂 ${tag.domain} 实体),员工是否命中靠下游 JOIN 派生,不直接打人。挂实体用 \`tag link --tag <code> --entity <uuid>\`。`,
    });
  }

  const [employee] = await db
    .select({ empId: schema.employees.empId })
    .from(schema.employees)
    .where(eq(schema.employees.empId, empId));
  if (!employee) return emitError("employee_not_found", { empId });

  const [existing] = await db
    .select({ id: schema.employeeTagMap.id })
    .from(schema.employeeTagMap)
    .where(
      and(
        eq(schema.employeeTagMap.tagId, tag.id),
        eq(schema.employeeTagMap.empId, empId),
      ),
    );
  if (existing) {
    return emit("already_linked", { tagId: tag.id, empId });
  }

  await db
    .insert(schema.employeeTagMap)
    .values({ tagId: tag.id, empId, reasoning });
  emit("linked", { tagId: tag.id, empId });
}

async function cmdEmployeeTagRemove(opts: Flags) {
  const empId = required(opts, "emp");
  const tagRef = normalizeName(required(opts, "tag"));

  const tag = await resolveTag(tagRef);
  if (!tag) return emitError("tag_not_found", { tagRef });

  if (tag.mode !== "assertion") {
    return emitError("wrong_tag_mode", {
      tagId: tag.id,
      tagCode: tag.tagCode,
      tagMode: tag.mode,
      tagDomain: tag.domain,
      hint: `这是名单标签(挂 ${tag.domain} 实体)。撤实体用 \`tag unlink --tag <code> --entity <uuid>\`。`,
    });
  }

  const removed = await db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(schema.employeeTagMap)
      .where(
        and(
          eq(schema.employeeTagMap.tagId, tag.id),
          eq(schema.employeeTagMap.empId, empId),
        ),
      );
    if (!target) return null;

    await tx.insert(schema.auditLog).values({
      tableName: "employee_tag_map",
      beforeData: target,
      command: CLI_INVOCATION,
    });
    await tx
      .delete(schema.employeeTagMap)
      .where(eq(schema.employeeTagMap.id, target.id));
    return target;
  });

  if (!removed) {
    return emit("not_linked", { tagId: tag.id, empId });
  }
  emit("unlinked", { tagId: tag.id, empId });
}

// ---------------------------------------------------------------------------
// Commands — Alias
// ---------------------------------------------------------------------------

async function cmdAliasAdd(opts: Flags) {
  const entityType = normalizeName(required(opts, "type"));
  const rawName = normalizeName(required(opts, "raw-name"));
  const entityId = required(opts, "entity");
  const reasoning = optional(opts, "reasoning");
  const force = flag(opts, "force");

  const [entity] = await db
    .select({
      id: schema.entities.id,
      entityType: schema.entities.entityType,
    })
    .from(schema.entities)
    .where(eq(schema.entities.id, entityId));
  if (!entity) return emitError("entity_not_found", { entityId });

  if (entity.entityType !== entityType) {
    return emitError("cross_domain_rejected", {
      flagEntityType: entityType,
      entityId,
      entityEntityType: entity.entityType,
      hint: "alias 必须挂在同一任务域内(同一名字作 school 和作 company 是两条独立映射链)。",
    });
  }

  const [existing] = await db
    .select({
      id: schema.entityAliases.id,
      entityType: schema.entityAliases.entityType,
      rawName: schema.entityAliases.rawName,
      entityId: schema.entityAliases.entityId,
      reasoning: schema.entityAliases.reasoning,
      createdAt: schema.entityAliases.createdAt,
      updatedAt: schema.entityAliases.updatedAt,
    })
    .from(schema.entityAliases)
    .where(
      and(
        eq(schema.entityAliases.entityType, entityType),
        eq(schema.entityAliases.rawName, rawName),
      ),
    );

  if (existing && existing.entityId === entityId) {
    return emit("already_mapped", serializeAlias(existing));
  }

  if (existing && !force) {
    return emitError("conflict_needs_force", {
      existing: serializeAlias(existing),
      incoming: { entityType, rawName, entityId },
      hint: "raw_name 已挂给其他实体。如确认改判,加 --force 覆盖(同事务先写 audit_log)。",
    });
  }

  const values = {
    entityType,
    rawName,
    entityId,
    reasoning,
    updatedAt: new Date(),
  };

  let aliasId: string;
  let status: "created" | "force_overwritten";
  if (existing) {
    aliasId = await db.transaction(async (tx) => {
      await tx.insert(schema.auditLog).values({
        tableName: "entity_aliases",
        beforeData: existing,
        command: CLI_INVOCATION,
      });
      await tx
        .update(schema.entityAliases)
        .set(values)
        .where(eq(schema.entityAliases.id, existing.id));
      return existing.id;
    });
    status = "force_overwritten";
  } else {
    const [row] = await db
      .insert(schema.entityAliases)
      .values(values)
      .returning({ id: schema.entityAliases.id });
    aliasId = row.id;
    status = "created";
  }

  await writeAliasEmbedding(aliasId, rawName);

  emit(status, {
    aliasId,
    entityType,
    rawName,
    entityId,
    reasoning: reasoning ?? null,
  });
}

// ---------------------------------------------------------------------------
// Commands — Employee profile lookup
// ---------------------------------------------------------------------------

async function cmdEmployeeGet(empId: string) {
  const [employee] = await db
    .select()
    .from(schema.employees)
    .where(eq(schema.employees.empId, empId));
  if (!employee) return emitError("employee_not_found", { empId });

  const workExperience = await db
    .select({
      id: schema.employeeWorkExperiences.id,
      companyName: schema.employeeWorkExperiences.companyName,
      positionTitle: schema.employeeWorkExperiences.positionTitle,
      startDate: schema.employeeWorkExperiences.startDate,
      endDate: schema.employeeWorkExperiences.endDate,
      country: schema.employeeWorkExperiences.country,
    })
    .from(schema.employeeWorkExperiences)
    .where(eq(schema.employeeWorkExperiences.empId, empId))
    .orderBy(sql`${schema.employeeWorkExperiences.startDate} DESC NULLS LAST`);

  const education = await db
    .select({
      id: schema.employeeEducations.id,
      school: schema.employeeEducations.school,
      major: schema.employeeEducations.major,
      degree: schema.employeeEducations.degree,
      startDate: schema.employeeEducations.startDate,
      endDate: schema.employeeEducations.endDate,
    })
    .from(schema.employeeEducations)
    .where(eq(schema.employeeEducations.empId, empId))
    .orderBy(sql`${schema.employeeEducations.startDate} DESC NULLS LAST`);

  const [latestResume] = await db
    .select({
      id: schema.employeeResumes.id,
      workList: schema.employeeResumes.workList,
      updateTime: schema.employeeResumes.updateTime,
    })
    .from(schema.employeeResumes)
    .where(eq(schema.employeeResumes.empId, empId))
    .orderBy(sql`${schema.employeeResumes.updateTime} DESC NULLS LAST`)
    .limit(1);

  const tags = await db
    .select({
      tagId: schema.tags.id,
      tagCode: schema.tags.tagCode,
      tagName: schema.tags.tagName,
      reasoning: schema.employeeTagMap.reasoning,
    })
    .from(schema.employeeTagMap)
    .innerJoin(schema.tags, eq(schema.employeeTagMap.tagId, schema.tags.id))
    .where(eq(schema.employeeTagMap.empId, empId));

  emit("ok", {
    ...serializeEmployee(employee),
    workExperience,
    education,
    resume: latestResume ?? null,
    tags,
  });
}

async function cmdEmployeeSearch(rawQuery: string) {
  const query = rawQuery.trim();
  if (!query) return emitError("missing_query", { hint: "query is required" });
  const pattern = `%${query}%`;
  const rows = await db
    .select({
      empId: schema.employees.empId,
      name: schema.employees.name,
    })
    .from(schema.employees)
    .where(ilike(schema.employees.name, pattern))
    .orderBy(schema.employees.name)
    .limit(50);

  emit("ok", rows, { count: rows.length });
}

// ---------------------------------------------------------------------------
// Commands — Audit
// ---------------------------------------------------------------------------

async function cmdAuditList(opts: Flags) {
  const tableName = optional(opts, "table");
  const limit = Number(optional(opts, "limit") ?? "20");
  const tagRef = optional(opts, "tag");
  const entityId = optional(opts, "entity");
  const rawNameRaw = optional(opts, "raw-name");
  const rawName = rawNameRaw ? normalizeName(rawNameRaw) : undefined;

  const conditions = [];
  if (tableName) conditions.push(eq(schema.auditLog.tableName, tableName));

  if (tagRef) {
    const tag = await resolveTag(tagRef);
    if (!tag) return emitError("tag_not_found", { tagRef });
    conditions.push(sql`${schema.auditLog.beforeData}->>'tagId' = ${tag.id}`);
  }
  if (entityId) {
    conditions.push(
      sql`${schema.auditLog.beforeData}->>'entityId' = ${entityId}`,
    );
  }
  if (rawName) {
    conditions.push(
      sql`${schema.auditLog.beforeData}->>'rawName' = ${rawName}`,
    );
  }

  const q = db.select().from(schema.auditLog).$dynamic();
  if (conditions.length > 0) q.where(and(...conditions));
  const rows = await q.orderBy(sql`created_at DESC`).limit(limit);

  emit(
    "ok",
    rows.map((r) => ({
      auditId: r.id,
      tableName: r.tableName,
      beforeData: r.beforeData,
      command: r.command,
      createdAt: r.createdAt,
    })),
  );
}

// ---------------------------------------------------------------------------
// Commands — Sync changeset
// ---------------------------------------------------------------------------
//
// 周度链路:sync 灌完员工四表后,调度方调本命令拿 changeset,据此 fan-out 周期 batch
// (`/orchestrate-tagging` 的 list-tag-weekly / assertion-tag-monthly 任务)。
//
// 设计要点:**数据落盘到 CSV 文件,stdout envelope 只回路径 + 计数**——agent 调本命令
// 后只看 envelope(小,不进 LLM context),把文件路径甩给下一步 worker / batch 输入即可。
//
// 三类产物:
//   - emps.csv          assertion-tag-monthly 入参:新员工 + 简历更新员工 union
//                       (列: emp_id, name, hr_status, trigger)
//   - school-raws.csv   list-tag-weekly 入参:未登记 school raw_names
//                       (列: raw_name,与 export-raw-names.py 同格式)
//   - company-raws.csv  /attribute-raw-name 入参:未登记 company raw_names(同上)
//
// since 派生 emps,raws 是"全量未登记快照"——明细表 TRUNCATE+INSERT,无"本周新出现"语义,
// attribute 完一批 alias 表会增长,下次跑自然递减。

const SYNC_TARGETS = ["emps", "schools", "companies"] as const;
type SyncTarget = (typeof SYNC_TARGETS)[number];

function csvEscape(v: string | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function cmdSyncChangeset(opts: Flags) {
  const sinceStr = required(opts, "since");
  const since = new Date(sinceStr);
  if (isNaN(since.getTime())) {
    return emitError("invalid_since", {
      since: sinceStr,
      hint: "Use ISO 8601 timestamp, e.g., '2026-04-26T00:00:00Z'",
    });
  }

  const outDir = required(opts, "out");

  // --targets 默认全部;传子集时校验合法值
  const targetsRaw = optional(opts, "targets");
  const targets: Set<SyncTarget> = new Set(
    targetsRaw
      ? (targetsRaw.split(",").map((t) => t.trim()) as SyncTarget[])
      : SYNC_TARGETS,
  );
  for (const t of targets) {
    if (!SYNC_TARGETS.includes(t)) {
      return emitError("invalid_target", {
        target: t,
        validTargets: SYNC_TARGETS,
        hint: "--targets accepts comma-separated subset of: emps,schools,companies",
      });
    }
  }

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  await fs.mkdir(outDir, { recursive: true });

  const files: Record<string, { path: string; rowCount: number }> = {};

  // ---- emps: 新员工 ∪ 简历更新员工(同员工合并,trigger 标 new/resume_updated/both)----
  if (targets.has("emps")) {
    const newEmps = await db
      .select({
        empId: schema.employees.empId,
        name: schema.employees.name,
        hrStatus: schema.employees.hrStatus,
      })
      .from(schema.employees)
      .where(sql`${schema.employees.createdAt} >= ${since}`);

    const resumeUpdated = await db.execute(sql`
      SELECT e.emp_id, e.name, e.hr_status
      FROM employees e
      JOIN employee_resumes r ON e.emp_id = r.emp_id
      WHERE r.update_time >= ${since}
      GROUP BY e.emp_id, e.name, e.hr_status
    `);
    const resumeRows = resumeUpdated.rows as Array<{
      emp_id: string;
      name: string;
      hr_status: string | null;
    }>;

    type EmpRow = {
      empId: string;
      name: string;
      hrStatus: string | null;
      trigger: "new" | "resume_updated" | "both";
    };
    const merged = new Map<string, EmpRow>();
    for (const e of newEmps) {
      merged.set(e.empId, {
        empId: e.empId,
        name: e.name,
        hrStatus: e.hrStatus,
        trigger: "new",
      });
    }
    for (const r of resumeRows) {
      const existing = merged.get(r.emp_id);
      if (existing) {
        existing.trigger = "both";
      } else {
        merged.set(r.emp_id, {
          empId: r.emp_id,
          name: r.name,
          hrStatus: r.hr_status,
          trigger: "resume_updated",
        });
      }
    }
    const empsRows = [...merged.values()].sort((a, b) =>
      a.empId.localeCompare(b.empId),
    );

    const empsPath = path.join(outDir, "emps.csv");
    const empsCsv =
      "emp_id,name,hr_status,trigger\n" +
      empsRows
        .map((r) =>
          [r.empId, r.name, r.hrStatus, r.trigger].map(csvEscape).join(","),
        )
        .join("\n") +
      (empsRows.length > 0 ? "\n" : "");
    await fs.writeFile(empsPath, empsCsv, "utf8");
    files.emps = { path: empsPath, rowCount: empsRows.length };
  }

  // ---- school-raws ----
  // education filter: 剔除非高等教育段(高中/中专/初中及以下/技校/大专)。
  // talent-graph 学校 entity 服务大学校友身份语义,基础教育段写法不进 raw 池。
  // NULL / '其他' / '博士后' 保留 —— 数据不全时保守通过,worker 端再判。
  if (targets.has("schools")) {
    const rows = (
      await db.execute(sql`
        SELECT DISTINCT ed.school AS raw_name
        FROM employee_educations ed
        LEFT JOIN entity_aliases a
          ON a.entity_type = 'school' AND a.raw_name = ed.school
        WHERE a.id IS NULL AND ed.school IS NOT NULL AND ed.school <> ''
          AND (ed.education IS NULL
               OR ed.education NOT IN ('高中', '中专', '初中及以下', '技校', '大专'))
        ORDER BY ed.school
      `)
    ).rows as Array<{ raw_name: string }>;

    const filePath = path.join(outDir, "school-raws.csv");
    const csv =
      "raw_name\n" +
      rows.map((r) => csvEscape(r.raw_name)).join("\n") +
      (rows.length > 0 ? "\n" : "");
    await fs.writeFile(filePath, csv, "utf8");
    files.schoolRaws = { path: filePath, rowCount: rows.length };
  }

  // ---- company-raws ----
  if (targets.has("companies")) {
    const rows = (
      await db.execute(sql`
        SELECT DISTINCT we.company_name AS raw_name
        FROM employee_work_experiences we
        LEFT JOIN entity_aliases a
          ON a.entity_type = 'company' AND a.raw_name = we.company_name
        WHERE a.id IS NULL AND we.company_name IS NOT NULL AND we.company_name <> ''
        ORDER BY we.company_name
      `)
    ).rows as Array<{ raw_name: string }>;

    const filePath = path.join(outDir, "company-raws.csv");
    const csv =
      "raw_name\n" +
      rows.map((r) => csvEscape(r.raw_name)).join("\n") +
      (rows.length > 0 ? "\n" : "");
    await fs.writeFile(filePath, csv, "utf8");
    files.companyRaws = { path: filePath, rowCount: rows.length };
  }

  emit("ok", {
    since: since.toISOString(),
    outDir,
    targets: [...targets],
    files,
  });
}

// ---------------------------------------------------------------------------
// Commands — Maintenance
// ---------------------------------------------------------------------------

async function cmdEmbeddingBackfill() {
  if (!isEmbeddingConfigured()) {
    return emitError("embedding_unconfigured", {
      hint: "Set EMBEDDING_BASE_URL, EMBEDDING_API_KEY, EMBEDDING_MODEL in .env.local",
    });
  }

  let entitiesUpdated = 0;
  let aliasesUpdated = 0;

  const entitiesMissing = await db
    .select({
      id: schema.entities.id,
      canonicalName: schema.entities.canonicalName,
    })
    .from(schema.entities)
    .where(sql`name_embedding IS NULL`);

  if (entitiesMissing.length > 0) {
    console.error(`[backfill] entities missing embedding: ${entitiesMissing.length}`);
    for (const entity of entitiesMissing) {
      const fetch = await getEmbedding(entity.canonicalName);
      if (fetch.status !== "ok") continue;
      await db.execute(
        sql`UPDATE entities SET name_embedding = ${JSON.stringify(fetch.vector)}::vector WHERE id = ${entity.id}`,
      );
      entitiesUpdated++;
    }
  }

  const aliasesMissing = await db
    .select({
      id: schema.entityAliases.id,
      rawName: schema.entityAliases.rawName,
    })
    .from(schema.entityAliases)
    .where(sql`name_embedding IS NULL`);

  if (aliasesMissing.length > 0) {
    console.error(`[backfill] aliases missing embedding: ${aliasesMissing.length}`);
    for (const row of aliasesMissing) {
      const fetch = await getEmbedding(row.rawName);
      if (fetch.status !== "ok") continue;
      await db.execute(
        sql`UPDATE entity_aliases SET name_embedding = ${JSON.stringify(fetch.vector)}::vector WHERE id = ${row.id}`,
      );
      aliasesUpdated++;
    }
  }

  emit("ok", {
    entitiesUpdated,
    aliasesUpdated,
    entitiesMissingBefore: entitiesMissing.length,
    aliasesMissingBefore: aliasesMissing.length,
  });
}

// ---------------------------------------------------------------------------
// Help + dispatch
// ---------------------------------------------------------------------------

const READONLY_HELP = `Read-only commands

  diag                              Ops preflight: DB reachability + pgvector
                                    extension. Run before deployment or when
                                    investigating environment issues.

  tag list [--mode M] [--domain D]  List tags. --mode filters by 'list' /
                                    'assertion'; --domain filters list-mode
                                    tags by entity domain.
  tag get <code|id>                 Show one tag's definition + member count.
  tag members <code|id>             Show who/what's attached. List-mode tags
                                    return entities (with matchMode); assertion-
                                    mode tags return employees.

  entity list [--type T]            List entities. Optional --type filter.
  entity get <uuid>                 Show an entity by UUID + aliases + tags +
                                    direct children (one level).
  entity get <type> <name>          Same, by (type, canonical name) tuple.
  entity search <q> --type T        Find entities by name. Returns
                                    data.exact[] (name fragment matches,
                                    use canonicalName === query for the
                                    exact hit) and data.similar[] (close-
                                    enough matches by relevance score).

  employee get <emp_id>             Show an employee's profile + assertion tags.
  employee search <q>               Find employees by name (substring match).

  alias list [filters...]           Browse raw_name → entity mappings.
                                    Filters: --type / --entity / --raw-name.

  audit list [filters...]           Show destructive-op history (deletes /
                                    force overwrites). Filters: --table /
                                    --tag / --entity / --raw-name / --limit.

  sync changeset --since <ISO ts> --out <dir> [--targets <list>]
                                    Derive周度 batch input post-sync, write to CSV files
                                    under <out> (mkdir -p), stdout envelope only carries
                                    paths + row counts (agent-friendly: small context).
                                    Files: emps.csv (cohort for assertion-tag-monthly:
                                    new + resume-updated emps, cols emp_id/name/hr_status
                                    /trigger), school-raws.csv (input for list-tag-weekly)
                                    + company-raws.csv (input for /attribute-raw-name):
                                    unattributed raws, 1-col raw_name. --targets is
                                    comma-separated subset of {emps,schools,companies};
                                    default = all three. Caller (scheduler / orchestrator)
                                    records last-run timestamp and passes it back next round.
`;

const FULL_EXTRA_HELP = `Write commands  (TALENT_GRAPH_MODE=full)

  tag add --code --name --description --mode <list|assertion> [--domain D]
                                    Create or reuse a tag. mode='list' (名单标签,
                                    --domain required) → members are entities of
                                    that domain, attached via tag link.
                                    mode='assertion' (判定标签) → members are
                                    employees, attached via employee tag-add.
                                    Idempotent on code; mode/domain are immutable
                                    once set (use new tag_code to change).

  tag link --tag <code|id> --entity <uuid>
           [--match-mode <exact|subtree>] [--reasoning]
                                    Attach an entity to a list-mode tag.
                                    --match-mode defaults to 'subtree'
                                    (downstream JOIN traverses entities.parent_id
                                    children). 'exact' = only this entity.
                                    Re-link with new match-mode = update in place.
                                    Rejects assertion tags.
  tag unlink --tag <code|id> --entity <uuid>
                                    Detach. Records removal in audit log.
                                    No-op if absent. Rejects assertion tags.

  employee tag-add --emp <emp_id> --tag <code|id> [--reasoning]
                                    Apply an assertion tag to an employee.
                                    Idempotent. Rejects list-mode tags.
  employee tag-remove --emp <emp_id> --tag <code|id>
                                    Withdraw. Records removal in audit log.
                                    No-op if absent. Rejects list-mode tags.

  entity add --type --canonical-name [--description] [--parent <uuid>]
             [--force-new]
                                    Create or reuse a canonical entity. Same
                                    name → already_exists. Close-enough match
                                    → similar_exists with suggestions[].
                                    --parent attaches a parent entity (must
                                    share entity_type). 阿里巴巴 → 菜鸟 用例
                                    在父子上建,用 tag link --match-mode subtree
                                    驱动传递性命中。

  alias add --type --raw-name --entity <uuid> [--reasoning] [--force]
                                    Map a raw name to an entity. Conflict with
                                    an existing mapping requires --force, which
                                    records the prior value in audit log.

  embedding backfill                Compute embeddings for any rows missing them
                                    (requires EMBEDDING_* env).
`;

function printHelp(exitCode: number) {
  const modeLine =
    MODE === "readonly"
      ? "Mode: readonly  (set TALENT_GRAPH_MODE=full to enable write commands)"
      : "Mode: full      (write commands enabled)";

  const body =
    MODE === "full"
      ? `${READONLY_HELP}\n${FULL_EXTRA_HELP}`
      : `${READONLY_HELP}\nWrite commands are hidden in readonly mode.\nRun TALENT_GRAPH_MODE=full talent-graph with no args to see them.\n`;

  // Help 不是机器输出,直接 stderr 走 (stdout 的 envelope 协议保持纯净)。
  console.error(
    `Usage: talent-graph <noun> <verb> [args]\n${modeLine}\n\n` +
      `All commands emit a single JSON envelope to stdout:\n` +
      `  { ok, status, data, meta: { command, ... } }\n` +
      `Human-readable progress goes to stderr.\n\n${body}`,
  );
  process.exit(exitCode);
}

async function dispatch(
  resource: string,
  action: string,
  positionals: string[],
  opts: Flags,
): Promise<void> {
  switch (`${resource}.${action}`) {
    case "tag.list":
      return cmdTagList(opts);
    case "tag.get":
      return cmdTagGet(
        requirePositional(positionals, 0, "tag get", "code|id"),
      );
    case "tag.members":
      return cmdTagMembers(
        requirePositional(positionals, 0, "tag members", "code|id"),
      );
    case "tag.add":
      return cmdTagAdd(opts);
    case "tag.link":
      return cmdTagLink(opts);
    case "tag.unlink":
      return cmdTagUnlink(opts);

    case "entity.list":
      return cmdEntityList(opts);
    case "entity.get":
      return cmdEntityGet(positionals);
    case "entity.search":
      return cmdEntitySearch(
        requirePositional(positionals, 0, "entity search", "query"),
        opts,
      );
    case "entity.add":
      return cmdEntityAdd(opts);

    case "employee.get":
      return cmdEmployeeGet(
        requirePositional(positionals, 0, "employee get", "emp_id"),
      );
    case "employee.search":
      return cmdEmployeeSearch(
        requirePositional(positionals, 0, "employee search", "query"),
      );
    case "employee.tag-add":
      return cmdEmployeeTagAdd(opts);
    case "employee.tag-remove":
      return cmdEmployeeTagRemove(opts);

    case "alias.list":
      return cmdAliasList(opts);
    case "alias.add":
      return cmdAliasAdd(opts);

    case "audit.list":
      return cmdAuditList(opts);

    case "sync.changeset":
      return cmdSyncChangeset(opts);

    case "embedding.backfill":
      return cmdEmbeddingBackfill();

    default:
      return emitError("unknown_command", {
        attempted: `${resource} ${action}`,
        hint: "Run talent-graph with no args to see usage.",
      });
  }
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0) {
    printHelp(0);
    return;
  }

  // diag 是没有 verb 的单段命令 (preflight 应当尽量好打)
  if (argv[0] === "diag") {
    setCommand("diag");
    try {
      await cmdDiag();
      process.exit(0);
    } catch (err) {
      return emitError("internal_error", {
        message: (err as Error).message,
      });
    }
  }

  const [resource, action, ...rest] = argv;
  if (!action) {
    setCommand(resource);
    return emitError("missing_action", {
      resource,
      hint: "Run talent-graph with no args to see usage.",
    });
  }

  const actionKey = `${resource}.${action}`;
  setCommand(actionKey);

  const { flags: opts, positionals } = parseArgs(rest);

  // Reject write verbs in readonly mode before any DB work happens.
  if (MUTATING_ACTIONS.has(actionKey) && MODE === "readonly") {
    return emitError("readonly_mode", {
      attempted: actionKey,
      hint: "Set TALENT_GRAPH_MODE=full to enable write commands.",
    });
  }

  try {
    await dispatch(resource, action, positionals, opts);
    process.exit(0);
  } catch (err) {
    return emitError("internal_error", {
      message: (err as Error).message,
    });
  }
}

main();
