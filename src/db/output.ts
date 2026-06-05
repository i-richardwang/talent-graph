/**
 * CLI 输出协议:每条命令在 stdout 输出**单一 JSON envelope**;人类可读的进度
 * 与警告走 stderr。Agent 解析 stdout 一次 JSON.parse 到位,所有失败 / 降级 /
 * 部分成功都从 envelope 字段里读。
 *
 * Envelope 形状:
 *
 *   {
 *     "ok": boolean,            // exit code 的 JSON 镜像 (true ↔ exit 0)
 *     "status": string,          // 命令侧离散闭集,见各命令实现
 *     "data": T,                 // 命令产物
 *     "meta": {
 *       "command": "tag.add",    // <noun>.<verb>;Agent 拼多步报告时用来回指来源
 *       ...                       // 命令特有 extras
 *     }
 *   }
 *
 * 强制规则:
 * - stdout 永远只出 envelope 一次,不混 plain text 前缀
 * - 命令实现层禁止 console.log / process.stdout.write 写其它内容
 * - 进度提示用 console.error / console.warn (走 stderr,不污染 envelope)
 * - 出口序列化必走 serializeTag / serializeEntity / serializeAlias / serializeEmployee,
 *   禁止直接 spread Drizzle row,以保证字段命名一致 (tagId / entityId / aliasId / empId)
 */

import type {
  tags,
  entities,
  entityAliases,
  employees,
} from "./schema";

// ---------------------------------------------------------------------------
// Mode
// ---------------------------------------------------------------------------

export type Mode = "readonly" | "full";

export function getMode(): Mode {
  return process.env.TALENT_GRAPH_MODE === "full" ? "full" : "readonly";
}

// ---------------------------------------------------------------------------
// Envelope emit
// ---------------------------------------------------------------------------

let CURRENT_COMMAND = "";

/**
 * 在 main() 进入 dispatch 前调用一次,把当前命令名注入。emit/emitError 会把它写进
 * meta.command,Agent 用来分辨 envelope 来自哪条命令。
 */
export function setCommand(cmd: string): void {
  CURRENT_COMMAND = cmd;
}

interface Envelope<T> {
  ok: boolean;
  status: string;
  data: T;
  meta: {
    command: string;
    [extra: string]: unknown;
  };
}

function buildEnvelope<T>(
  ok: boolean,
  status: string,
  data: T,
  metaExtra: Record<string, unknown>,
): Envelope<T> {
  return {
    ok,
    status,
    data,
    meta: {
      command: CURRENT_COMMAND,
      ...metaExtra,
    },
  };
}

function writeEnvelope<T>(envelope: Envelope<T>): void {
  process.stdout.write(JSON.stringify(envelope, null, 2) + "\n");
}

/**
 * 成功路径:打 envelope 到 stdout,exit 0 由 main 兜底。
 * status 由命令传入 (例如 "created" / "already_exists" / "ok")。
 */
export function emit<T>(
  status: string,
  data: T,
  metaExtra: Record<string, unknown> = {},
): void {
  writeEnvelope(buildEnvelope(true, status, data, metaExtra));
}

/**
 * 失败路径:打 envelope 到 stdout (ok=false),立即 exit 1。Agent 同样能 JSON.parse,
 * 通过 status 字段分支处理 (entity_not_found / similar_exists / conflict_needs_force / ...)。
 *
 * 设计取舍:把"错误"也作为可机器解析的 envelope 而不是 stderr 文本——agent 即便看到
 * 非零 exit,也能直接读 stdout 拿到结构化原因和 suggestions/hint。stderr 仅用于人类
 * 调试 (在 batch 日志里浏览)。
 */
export function emitError<T>(
  status: string,
  data: T,
  metaExtra: Record<string, unknown> = {},
): never {
  writeEnvelope(buildEnvelope(false, status, data, metaExtra));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Serializers — owner-prefixed PK fields (tagId / entityId / aliasId / empId)
// ---------------------------------------------------------------------------
//
// 命令实现禁止直接把 Drizzle row spread 进 envelope.data,必须经这一层转换。
// 原因:Drizzle 的 row.id 在不同表上语义不同 (tags.id / entities.id / ...),
// 直接 spread 会让消费方看到一个含义模糊的 `id` 字段,跨命令拼接时极易混淆。

type TagRow = typeof tags.$inferSelect;
type EntityRow = typeof entities.$inferSelect;
type AliasRow = typeof entityAliases.$inferSelect;
type EmployeeRow = typeof employees.$inferSelect;

export interface TagOut {
  tagId: string;
  tagCode: string;
  tagName: string;
  // 'list'      → 名单标签:成员是实体清单,挂载走 tag link/unlink (写 tag_entity_map);
  //                员工是否命中靠下游 JOIN 派生。kind = 某 entity_type。
  // 'assertion' → 判定标签:成员是员工清单,挂载走 employee tag-add/tag-remove (写
  //                employee_tag_map)。kind ∈ {skill, experience}。
  mode: "list" | "assertion";
  // 统一分类轴(恒非空):list 模式下是挂的实体类型(对齐 entities.entity_type,
  // 'school' / 'company' / ...);assertion 模式下是判定子类型('skill' / 'experience')。
  kind: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export function serializeTag(row: TagRow): TagOut {
  return {
    tagId: row.id,
    tagCode: row.tagCode,
    tagName: row.tagName,
    mode: row.mode as "list" | "assertion",
    kind: row.kind,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface EntityOut {
  entityId: string;
  entityType: string;
  canonicalName: string;
  description: string | null;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// 接受带或不带 nameEmbedding 的两种形状 (查询时通常已剥),向量永远不出 envelope:
// 1536 维浮点数对消费方无价值,且会让 envelope 体积爆炸。
export function serializeEntity(
  row: EntityRow | Omit<EntityRow, "nameEmbedding">,
): EntityOut {
  return {
    entityId: row.id,
    entityType: row.entityType,
    canonicalName: row.canonicalName,
    description: row.description,
    parentId: row.parentId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface AliasOut {
  aliasId: string;
  entityType: string;
  rawName: string;
  entityId: string;
  reasoning: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function serializeAlias(
  row: AliasRow | Omit<AliasRow, "nameEmbedding">,
): AliasOut {
  return {
    aliasId: row.id,
    entityType: row.entityType,
    rawName: row.rawName,
    entityId: row.entityId,
    reasoning: row.reasoning ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface EmployeeOut {
  empId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export function serializeEmployee(row: EmployeeRow): EmployeeOut {
  return {
    empId: row.empId,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
