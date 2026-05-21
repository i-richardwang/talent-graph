# Testing — Agent 操作约定

talent-graph 的测试基建。读这一篇直接能写新 spec,不必再请教架构;**架构选型上的几个反复历史已收敛**(见下方"已显式拒绝的方向"),新 agent 不要重新提案。

---

## 架构总览

```
PostgreSQL(端口 5434,docker profile=test,与 dev 容器物理隔离)
└─ talent_graph_test_template      ← 唯一 template:schema + pgvector,无业务数据
   ├─ talent_graph_test_w1         ← worker DB,clone 自 template
   ├─ talent_graph_test_w2
   ├─ talent_graph_test_w3
   └─ talent_graph_test_w4
```

- worker 数由 `.env.test` 的 `TEST_WORKER_COUNT` 决定,默认 4
- spec 文件级并发:每个 spec 文件 `beforeAll` 占一个 worker(advisory lock 协调),`afterAll` 释放,跨 spec 文件可真正并行
- 同 spec 内 test 之间走 `truncateAll(dbUrl)` 重置,亚秒级
- CLI 当黑盒测:`runCli([...args], { dbUrl })` spawn `talent-graph ...`,注入 `DATABASE_URL`,解析 stdout envelope JSON

---

## 已显式拒绝的方向

下面三条**已经反复评估并 reject**,新 agent 不要再提案,直接按现状走。

### ❌ 多 template / template registry

> 诱惑:`/tag-employee` 测员工判定标签要预灌 5 个完整 profile;把它塞进一个 `template_employees` 库,worker 克隆出来不就好了?省掉每个 test 反复 seed 的成本。

**不做**。理由:
- 引入 "template name" + "registry 配置" + "per-template reset 策略(truncate vs reclone)" 三个新概念,新人理解和维护成本明显上升
- worker pool 被迫和 template N:1 绑定,`acquire` 要传 templateName,helper API 不再 generic
- 我们的 seed 用原生 SQL 直插一般 ~100ms,beforeEach 反复跑不痛——template 预灌省的几百毫秒不值这点复杂度

→ 替代方案:**spec 自己在 beforeEach 调 seed 函数**(见下"加 seed"章节)。

### ❌ Mock 替代真实 PostgreSQL

talent-graph 的核心逻辑全在 PG 约束、pgvector 索引、CASCADE 行为、事务原子性里。mock 掉等于把要测的东西先假设掉,失去价值。

### ❌ 事务回滚做隔离

CLI 是子进程,每次新建连接,外层事务包不住跨进程的写。所以隔离手段必然是 truncate / drop-reclone,不是 `BEGIN ... ROLLBACK`。

---

## 命令

```bash
# 一次性:起测试容器(profile=test 不会启 dev 容器)
docker compose --profile test up -d postgres-test

# 一次性 / 改 migration 后:建 template + clone N 个 worker
bun run test:setup

# 平时
bun test                              # 全套(含 src/db/normalize.test.ts 等纯函数单测)
bun test tests/e2e                    # 仅 e2e
bun test tests/e2e/mbb-list-tag       # 单文件

# 清理(容器 / volume 保留,只删 template + workers)
bun run test:teardown
```

**改 migration 后必须重跑 `bun run test:setup`**,否则 worker 库 schema 落后于代码,测试会以诡异方式失败。

---

## 写新 spec 的模板

```ts
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { acquire, type Lease } from "../helpers/pool";
import { truncateAll } from "../helpers/reset";
import { runCli } from "../helpers/cli";
import { makeTag, makeEntity, makeAlias, linkTag } from "../helpers/fixtures";

describe("<场景名,例如:tag.unlink 物理删 + audit_log 兜底>", () => {
  let lease: Lease;

  beforeAll(async () => { lease = await acquire(); });
  afterAll(async () => { await lease.release(); });
  beforeEach(async () => { await truncateAll(lease.dbUrl); });

  test("<行为名,正向>", async () => {
    // 1. 灌 fixture
    const tag = await makeTag({ dbUrl: lease.dbUrl, code: "...", mode: "list", domain: "...", description: "..." });
    const entity = await makeEntity({ dbUrl: lease.dbUrl, type: "...", canonicalName: "..." });
    await linkTag({ dbUrl: lease.dbUrl, tag: tag.tagCode, entity: entity.entityId });

    // 2. 跑被测命令
    const res = await runCli<{ ... }>([...], { dbUrl: lease.dbUrl });

    // 3. 断言 envelope
    expect(res.envelope.ok).toBe(true);
    expect(res.envelope.status).toBe("...");
    expect(res.envelope.data.xxx).toEqual(...);
  });

  test("<行为名,负向 / 边界>", async () => {
    // ...
    expect(res.envelope.ok).toBe(false);
    expect(res.envelope.status).toBe("xxx_rejected");
    expect(res.exitCode).toBe(1);
  });
});
```

参考样板:`tests/e2e/mbb-list-tag.test.ts`(覆盖 happy path + 幂等 + `cross_domain_rejected`)。

**断言习惯**:
- 优先断 `envelope.ok` 和 `envelope.status`,这是 CLI 协议的承重契约
- 失败状态值都来自 `talent-graph` 的 `emitError`,不要 hard-code 字符串前先 grep 确认
- exitCode 永远是 `ok` 的镜像(0 ↔ true,1 ↔ false),不必两个都断

---

## 什么时候加 seed

绝大多数场景在测试体里用 `fixtures` helper 灌 3-5 条数据就够了,**不需要 seed**。

需要 seed 的判定信号(三条至少满足两条):
- 同一份基线 fixture 在 ≥5 个 test 里重复构造
- fixture 涉及多张表 + 跨表外键,堆下来 100+ 行 boilerplate
- fixture 灌一次成本 ≥1 秒(典型:`/tag-employee` 要 5+ 个完整 profile,涉及 employees + work_experiences + educations + resumes 四张表)

满足时,在 `tests/seeds/<scenario>.ts` 新建 seed 函数,spec 的 beforeEach 调用。

**先有真实痛点再建 seed**。预先建一堆备用 seed = 重蹈 multi-template 的过度设计覆辙。

---

## Seed 函数约定

新加 `tests/seeds/<name>.ts` 必须遵守:

### 1. 用原生 `pg` SQL 直插,不走 CLI

```ts
// ✅ 推荐
import { Client } from "pg";
export async function seedFiveEmployees(dbUrl: string): Promise<{ empIds: string[] }> {
  const client = new Client(dbUrl);
  await client.connect();
  try {
    await client.query(`
      INSERT INTO employees (emp_id, name, hr_status) VALUES
        ('emp_001', '张三', 'A1'),
        ('emp_002', '李四', 'A1'),
        ...
    `);
    // employee_work_experiences / educations / resumes 同理 INSERT
    return { empIds: ['emp_001', 'emp_002', '...'] };
  } finally {
    await client.end();
  }
}

// ❌ 反例:走 CLI
// for (const emp of EMPLOYEES) { await runCli(["employee", "add", ...], ...); }
// 5 emp × 4 子命令 = 20 次 subprocess spawn,~2s vs ~100ms,慢 20×
```

beforeEach 反复调,这个差距会放大。CLI 子进程的开销是不可压缩的固定成本。

### 2. ID 用稳定常量,不要随机

```ts
// ✅
const EMP_001 = 'emp_001';
const TAG_TECH = '00000000-0000-0000-0000-000000000001';

// ❌
const EMP_ID = `emp_${randomUUID()}`;  // 每次 seed 跑出来的 ID 都变,断言无法对照
```

确定性 ID 让测试可以 `expect(...).toBe('emp_001')`,跑多少次结果都一致。

### 3. seed 是纯函数,接 dbUrl,返回稳定 ID 清单

```ts
export async function seedXxx(dbUrl: string): Promise<{ ... }>;
```

**不接业务 flag**——"5 个员工 + 1 个特殊 case" 这种,新建另一个 seed,不要在同一函数加 `includeSpecialCase: true`。seed 含义固定,变种走新名字。

---

## 文件清单与角色

| 文件 | 角色 |
|---|---|
| `tools/test/setup-pool.ts` | drop + create template + migrate + clone N workers。改 migration 后必跑 |
| `tools/test/teardown-pool.ts` | 清理 template + workers(容器 / volume 不动) |
| `tests/helpers/pool.ts` | `acquire()` 占住一个 worker(session-level advisory lock),lease 持有自己的 coordinator 连接;`release()` 解锁 + 关连接 |
| `tests/helpers/reset.ts` | `truncateAll(dbUrl)`:动态查 `pg_tables` 后 TRUNCATE 全 public schema(drizzle migration 表在 `drizzle` schema,不受影响) |
| `tests/helpers/cli.ts` | `runCli<T>(args, { dbUrl, mode? })`:Bun.spawn,parse envelope,失败时 throw 带完整上下文 |
| `tests/helpers/fixtures.ts` | `makeTag` / `makeEntity` / `makeAlias` / `linkTag`:一行调用,失败 throw |
| `tests/seeds/<name>.ts` | 按需创建,场景级 seed 函数(见上方约定) |
| `.env.test` | 配置(已 gitignore;`.env.test.example` 是模板) |

helper 层全是 generic 的——不知道任何具体业务名字、不依赖具体 template、不耦合 spec。新 spec 通过参数与它们交互。

---

## Worker 数量调参

`.env.test` 的 `TEST_WORKER_COUNT` 控制并发上限:
- spec 文件数 ≤ worker 数 → 全并行
- spec 文件数 > worker 数 → 多余 spec 在 advisory lock 上排队,逐个轮转

改完必须 `bun run test:setup` 重建对应数量的 worker DB(setup 是幂等的)。

加大 worker 不会让单个 spec 变快——只有 spec 文件多到要并行时才有意义。50 spec 仍然 4 worker 完全够用(平均每 worker 处理 12-13 spec,串行完成)。

---

## 升级路径(YAGNI 兜底)

如果未来某个 seed 真的慢到痛(典型场景:必须调 embedding API 灌真实向量,单次 seed 5+ 秒,beforeEach 反复跑累计几十秒):

1. 把那个 scenario 的 seed 提取成独立 template,setup-pool 引入 registry
2. helper API 加可选参数 `acquire(templateName?)`,默认 `'empty'`
3. 现有 spec / helper 不动,新 spec opt-in 选 template

**触发条件是"实测痛"**(profile 之后超过 30s 测试时间花在 seed 上),不是"我觉得未来可能用得上"。

---

## 测试 ≠ Evaluation —— 边界要分清

**本基建只承担"测试"**:验证代码行为是否符合契约(CLI envelope 状态、schema 约束、CASCADE 行为、事务原子性),判定方式是确定性断言。

**Evaluation** 是另一回事:判断 AI 输出**质量好不好**(`/tag-employee` 给定 profile + tag description,Claude 的判决和 ground truth 一致率多高?`/define-tag` 的消歧准不准?)。判定方式是数据集比对 + 阈值 / 人工评分。

两者目录、基建、跑的频率都不同——目前 talent-graph **没有任何 evaluation 基建**(数据集、scoring 脚本、对比工具都缺),要做时单独立 `evaluation/` 目录,不要混进 `tests/`。

### 容易混淆的边界:`/tag-employee` 落库测试

`/tag-employee` 是 skill 不是 CLI 命令——Claude 通读 profile 综合判决后,**落库走 `employee tag-add`**。这条 CLI 命令本身的端到端行为(参数解析、`employee_tag_map` 写入、幂等)**属于本基建测的范围**;Claude 判决得对不对**不属于**。

写法上:

```ts
// ✅ 本基建该测的:落库行为
test("employee tag-add 写 employee_tag_map 是幂等的", async () => {
  // seed 一个 employee + 一个 assertion tag(SQL 直插 / fixtures)
  // 调 runCli(['employee', 'tag-add', ...]) 两次
  // 断言:第二次返 already_exists,employee_tag_map 仍只有一行
});

// ❌ 本基建不该测的:AI 判决质量
test("张三应该被打上'有 SaaS 销售经验' tag", async () => {
  // 跑 /tag-employee skill,看 Claude 输出
  // 这是 eval,不是 test——失败的修复路径是改 prompt / tag.description,不是改代码
});
```
