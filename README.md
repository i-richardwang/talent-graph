# talent-graph

**业务标签 + 标准实体 + 别名映射的事实源**(PostgreSQL 单库 + Agent 友好 CLI)。

把"标签 → 一组标准实体 → 实体在原始数据里的真实写法变体"这条三层映射,抽象成 6 张表 + 一组单步 CLI 命令 + 一组 Agent skill,提供共享存储、并发安全、向量近义探测、破坏性操作审计。

适用任何"原始数据里写法千奇百怪、需要先归一到标准实体、再按业务标签分类"的场景。例如:

- 简历里的 "哈佛" / "Harvard" / "哈佛大学" → 实体 `哈佛大学` → 标签 `藤校`
- 报表里的 "字节跳动(上海)" / "ByteDance" / "字节" → 实体 `字节跳动` → 标签 `TMD`
- 用户上报的城市名 "BJ" / "beijing" / "北京" / "北京市" → 实体 `北京` → 标签 `一线城市`

工具不假设你的下游是什么(数仓 / 业务库 / SaaS 都行),不假设上游怎么召回候选写法(SQL / 爬虫 / API 都行),不强制使用 Claude Code(CLI 完全独立,任何脚本都能调用)。

## 安装与使用

talent-graph 有两类典型使用场景,选对应路径即可。

### 场景 A:作为 CLI / lib 接入已有的 talent-graph PG

团队/同事已经有 talent-graph PG 实例运行,你只需要 CLI 来查询或写入:

```bash
npm install -g talent-graph

export DATABASE_URL=postgres://user:pass@host:5432/talent_graph
talent-graph diag    # 验证 DB 连通 + pgvector 扩展状态
talent-graph         # 不带参数查看完整 usage
```

程序化使用(在 Node.js / Bun 项目里 import schema 定义和归一化函数):

```typescript
import { schema, normalizeName } from "talent-graph";
```

CLI 默认 readonly 模式只暴露查询命令,需要执行写命令(`tag add` / `entity add` / `tag link` 等)时显式 `export TALENT_GRAPH_MODE=full`。详见 [CLI](#cli) 段。

### 场景 B:从零自托管(包括第一次部署)

需要自己起 PG + 初始化 schema + 配置环境的话走 git 仓库,npm 包不带 docker-compose / migrations / schema 文件:

```bash
git clone https://github.com/<org>/talent-graph.git
cd talent-graph
bun install
docker compose up -d              # 起本地 PG + pgvector(默认 5433 端口)
cp .env.example .env.local        # 填入 DATABASE_URL(+ 可选 EMBEDDING_*)
bun run db:migrate                # 跑 schema migrations
bun run db                        # 等价于 talent-graph,看 usage
bash tools/dev/seed.sh            # (可选)灌一组 demo 数据
```

生产环境用托管 PG(RDS / Supabase / Zeabur 等)直接设 `DATABASE_URL` 即可,确保实例装了 `vector` 扩展。自建 docker compose 通过环境变量覆盖默认值:

```bash
export POSTGRES_USER=... POSTGRES_PASSWORD=... POSTGRES_DB=... POSTGRES_PORT=5432
docker compose up -d
```

## 解决什么问题

| 问题 | 工具如何解决 |
|------|------|
| 标签清单要可增量维护 | `tags` 注册表(`mode` ∈ list/assertion 显式区分两类) + `tag_entity_map` / `employee_tag_map` 两张关联表(名单标签挂实体、判定标签直打员工),upsert 友好,Agent 单步命令逐条加挂/解绑 |
| 标准实体要防并发歧义 | `entities` 表新建时做向量近义探测——避免不同 session 用"清华"/"清华大学"分别建出两条实体导致下游分裂 |
| 原始名 → 标准实体的映射要可追溯、可纠错 | `entity_aliases` 单表 mapping,UNIQUE (entity_type, raw_name) 强约束,改判走 `--force` 覆盖 |
| 破坏性操作要可恢复 | `audit_log` 在同事务内先存整行旧值,事务保证日志和操作要么都成、要么都失败 |
| 字符脏数据(零宽 / NBSP / 全角空格)要避免静默漏匹配 | 入库统一过 `normalizeName` 剥零宽 + 扩展 trim;调用方下游 JOIN 必须做等价归一化(契约见下) |

## 架构

工具自身只到 PostgreSQL 为止,**上游怎么召回候选 raw_name、下游怎么 JOIN 消费,由调用方按其环境自管**:

```
┌────────────────────────────────────────────┐
│  调用方(任何脚本 / Claude Code session 等) │
└──────────────────┬─────────────────────────┘
                   │ talent-graph <命令>
                   ▼
┌────────────────────────────────────────────┐
│  CLI(talent-graph)                        │
│  查找 / 注册 / 关联 / 标准化 / 审计           │
│  upsert + 唯一索引去重 + 向量近义探测         │
└──────────────────┬─────────────────────────┘
                   │ Drizzle ORM
                   ▼
┌────────────────────────────────────────────┐
│  PostgreSQL + pgvector                     │
│  6 张表 = 三层映射事实源                     │
└────────────────────────────────────────────┘
```

## 数据模型

核心 6 张表(三层映射事实源 + 员工域映射 + 审计):

```
标签层    tags                  业务标签注册(tag_code 唯一,description 写明判决边界)
                                mode ∈ {list, assertion} 显式分类
                                domain 在 list 模式下记录挂载实体类型(对齐 entity_type)
          tag_entity_map        名单标签的实体清单 + match_mode(exact / subtree)
          employee_tag_map      判定标签的员工清单(emp_id 直挂)

实体层    entities              标准实体注册(按 entity_type + canonical_name 去重)
                                parent_id 自引用 FK,表达从属层级(阿里巴巴 → 菜鸟)
                                description 兼承身份说明与事实性历史

别名层    entity_aliases        原始写法 → 标准实体的观测映射
                                UNIQUE (entity_type, raw_name)
                                带向量列,支持新建实体的近义探测

审计      audit_log             remove / 覆盖式 update 的整行快照
                                同事务保证日志与操作原子绑定
```

### Tag 的两种模式

- **名单标签**(`mode='list'`,`domain` 必填,如 `school` / `company`):tag 是一个**实体清单**,员工是否命中靠下游 JOIN 实时派生(`employee.work.company → entity_aliases → entity → tag_entity_map`,沿 `match_mode` 决定是否包含后代)。挂载用 `tag link / unlink`。
- **判定标签**(`mode='assertion'`,`domain` 为 NULL):tag 是一个**员工清单**,AI/人工综合 profile 判决后直接固化在员工身上。挂载用 `employee tag-add / tag-remove`,写 `employee_tag_map`。

**`entity_type` 是任务域分区键**——常见取值 `school` / `company`,可任意扩展(`product` / `project` / `repo` / ...)。同一名单标签下所有挂载实体必须满足 `entity.entity_type = tag.domain`(CLI 在 `tag link` 拦跨域挂载)。

下游消费侧按 `(entity_type, raw_name)` 精确等值 JOIN `entity_aliases` 拿到 `entity_id`,再 JOIN `tag_entity_map` 展开标签——`match_mode='subtree'` 时需走 recursive CTE 沿 `parent_id` 向上找祖先。

### 实体层级:阿里巴巴 → 菜鸟 / 天猫 / 蚂蚁

母子公司、附属机构等从属关系存 `entities.parent_id`(自引用 FK)。配合 `tag_entity_map.match_mode`:

- `subtree`(默认):tag 命中此实体及所有后代。例:互联网公司 → 阿里巴巴(subtree),菜鸟员工经历命中
- `exact`:tag 仅命中此实体本身。例:物流 → 菜鸟(exact),不会让阿里巴巴所有员工进物流

父子必须同 `entity_type`,CLI 在 `entity add --parent` 拦跨域。

### canonical_name 与 raw_name:两层分流

`entities.canonical_name` 是**对外的标准名**(项目内部、agent CLI、人工查询都用这个名字指代实体,如 `entity get school 哈佛大学`);`entity_aliases.raw_name` 是**原始数据里真实出现过的写法**。两者完全分层、不互相镜像:

- canonical 一对一 (`UNIQUE (entity_type, canonical_name)`),raw 一对多(每观测到一种写法登记一行)
- `entity add` **不会**自动给 `entity_aliases` 写一条 `raw_name = canonical_name`——别名只记真实出现过的写法,canonical 可能根本不是任何 raw 的字面值(如 canonical = `字节跳动`,但上游永远是 `ByteDance` / `字节`)
- 上游恰好用了和 canonical 同名的写法,需要单独 `alias add` 登记
- **下游 JOIN 走 raw_name**(`source.company_name = entity_aliases.raw_name → entity_id`),canonical_name 不参与 JOIN

`canonical_name` 是 entity resolution 领域的固定术语("对外标准名"),不是和 raw 并列的"另一个名字"。

### 员工域 4 张表(判定标签工作流用)

```
employees                       员工主表(emp_id PK + name + hr_status)
employee_work_experiences       工作经历(1:N,companyName 走 normalizeName 入库)
employee_educations             教育经历(1:N,school 走 normalizeName 入库)
employee_resumes                简历(1:N,workList 是 raw JSON 字符串,取最新 by updateTime)
```

`hr_status` 是上游 HR 系统给的在职/离职状态原值(如 `'A1'` / `'在职'` / `'离职'`),sync 不约束取值集合保留上游原貌,**下游按场景自行过滤**——分析在职用全员 vs 历史切片包含离职,sync 不替下游决定。

**员工数据放本仓 PG**:`/tag-employee` skill 按 emp_id 拉员工 profile 综合判决判定标签(如"量化背景"),同 PG 直接 JOIN 比跨 CLI 拼接成本低。本仓约定 schema 而不假设上游来源——员工数据的同步任务由调用方按其上游(数仓 / parquet / API 等)实现。

## CLI

所有数据库操作通过 `talent-graph` CLI,**noun-verb 二级命令结构**(类似 `git remote add` / `kubectl get pods`):

```bash
talent-graph <noun> <verb> [options]
```

不带参数运行查看完整 usage。Noun = 资源(`tag` / `entity` / `employee` / `alias` / `audit` / `embedding`);verb = 动作(`list` / `get` / `members` / `search` / `add` / `link` / `unlink` / ...)。

| Noun | Readonly verbs | Full-mode verbs |
|------|---------------|----------------|
| `tag` | `tag list [--mode M] [--domain D]` / `tag get <code\|id>` / `tag members <code\|id>` | `tag add --mode <list\|assertion> [--domain D]` / `tag link [--match-mode]` / `tag unlink`(名单标签) |
| `entity` | `entity list [--type T]` / `entity get <uuid>` / `entity get <type> <name>` / `entity search <q> --type T` | `entity add [--parent <uuid>]` |
| `employee` | `employee get <emp_id>` / `employee search <q>` | `employee tag-add` / `employee tag-remove`(判定标签) |
| `alias` | `alias list [filters...]` | `alias add` |
| `audit` | `audit list [filters...]` | — |
| `embedding` | — | `embedding backfill` |

`tag members` 是输出形态自适应的:判定标签直接返回 `[{empId, name, reasoning}]`(不需要再逐条 `employee get` 查姓名),名单标签返回标准实体清单 `[{entityId, canonicalName, description, matchMode, reasoning}]`。`entity get` 同时支持 UUID 和 `(type, canonical_name)` 二元组两种形式,返回值含 `parentId` 与直接子实体 `children`(一层)。

`talent-graph diag` 是前置自检,返回 DB 连通性 / pgvector 扩展 / embedding 配置等信息。任何自动化任务都建议先跑一次。

### 输出协议: 单一 envelope JSON

所有命令的 stdout 是一个 JSON envelope (人类可读的进度走 stderr,不污染 stdout):

```jsonc
{
  "ok": true,            // exit code 镜像
  "status": "created",    // 命令侧离散闭集 (created / already_exists / similar_exists / ...)
  "data": { /* 命令产物 */ },
  "meta": { "command": "entity.add", /* 命令特有 extras */ }
}
```

失败也是 envelope (`ok: false` + `data.hint`),exit 1。Agent 解析直接 `JSON.parse(stdout)` 一次到位,按 `status` 离散分支。所有 PK 字段带 owner 前缀 (`tagId` / `entityId` / `aliasId` / `empId`),跨命令拼接不会撞名。详见 [`CLAUDE.md`](CLAUDE.md#输出协议-单一-envelope-json)。

### 模式: readonly(默认)vs full

CLI 由 `TALENT_GRAPH_MODE` 环境变量切换两档:

- **`readonly`(默认)**: 只暴露查询命令 + `audit`。下游通用 / 搜索 / 推荐类 agent 用,防止误调到 schema 改动命令。`--help` 也只列查询部分。
- **`full`**: 包含所有命令(查询 + 注册 + 关联 + 别名 + 维护),供 agent 跑标准化任务、维护脚本、CI 等显式开启写权限。

```bash
# 查询(默认 readonly,无需设置)
talent-graph entity search 清华 --type school

# 写操作需要显式开启 full
TALENT_GRAPH_MODE=full talent-graph entity add --type school --canonical-name 哈佛大学 --description "..."

# 维护脚本通常在 shell 里 export 一次后批量调
export TALENT_GRAPH_MODE=full
bash tools/dev/seed.sh   # 已内置 export
```

readonly 模式下调写命令会非零退出并提示 `Set TALENT_GRAPH_MODE=full to enable write commands.`

### 关键设计:单步原子、幂等

CLI **不提供批量接口**——所有操作都是"查 DB 现状 → 增量单条写"。

- `tag add` / `tag link` / `entity add` / `alias add` 重复同一组合 → 幂等(envelope `status=already_exists` / `already_linked` / `already_mapped`,`ok: true`,不当错)
- `alias add` 目标 entity 与现状一致 → 幂等;不一致 → `status=conflict_needs_force` 非零退出,改挂走 `--force`
- `entity add` 同名 (`(entity_type, canonical_name)`) → `already_exists` reuse;有"足够像"的已有实体 → `status=similar_exists` + `data.suggestions[]`,调用方 reuse 或 `--force-new`
- 内部实现:相似度走 pgvector + Embedding API,服务降级 (`EMBEDDING_*` 未配 / API 失败) 时 envelope 契约不变(`created` 仍正常出),写入照常,stderr 留 ops 告警,`embedding backfill` 在恢复后补 NULL 向量
- `tag unlink` 与 `alias add --force`(覆盖)在同事务内先把被操作行旧值写进 `audit_log`,再执行破坏性操作

批量场景(全量打标 / 周期重判 / 大型榜单初灌)由 `/orchestrate-tagging` skill 通过 DataPilot Batch + Automation 编排,见下方 `Agent 用法`。

## 字符归一化契约

所有参与 UNIQUE / 匹配 / JOIN 的字符串字段(`canonical_name` / `raw_name` / `tag_code` 等)入库前经 `src/db/normalize.ts` 的 `normalizeName` 统一处理:

- **剥离**:首尾空白(含 NBSP `\u00A0` / 全角空格 `\u3000`)、零宽字符(ZWSP `\u200B` / ZWNJ `\u200C` / ZWJ `\u200D` / BOM `\uFEFF`)
- **不动**:全半角 / 大小写 / 繁简 / 内部空格——这些是真实语义变体,靠 `entity_aliases` 的行穷举覆盖

**调用方契约**:下游 JOIN 时必须对原始字段做等价归一化,两端对称。多数 SQL 引擎默认 `TRIM()` 只剥 ASCII 空白,NBSP / 全角空格 / 零宽字符漏剥会**静默漏命中**。

PostgreSQL 参考写法(其他引擎按字符类规则改写,核心是"全局剥零宽 + 扩展首尾 trim"两步):

```sql
-- 等价于 src/db/normalize.ts 的 normalizeName,建议消费方库里建一次复用
CREATE FUNCTION normalize_name(s text) RETURNS text AS $$
  SELECT regexp_replace(
    regexp_replace(s, U&'[\200B-\200D\FEFF]', '', 'g'),                  -- 剥零宽 ZWSP/ZWNJ/ZWJ/BOM
    U&'^[[:space:]\00A0\3000]+|[[:space:]\00A0\3000]+$', '', 'g'      -- 扩展首尾 trim(含 NBSP / 全角空格)
  )
$$ LANGUAGE sql IMMUTABLE;

-- JOIN 时只需对**上游侧**套一次(entity_aliases.raw_name 入库时已归一)
SELECT a.entity_id
FROM source s
JOIN entity_aliases a
  ON a.entity_type = 'company'
 AND a.raw_name    = normalize_name(s.company_name);
```

归一化等价性可拿 CLI 的 `entity search "<样本>"` 做 round-trip 校验——给一段含 NBSP / 全角空格 / 零宽字符的样本,搜出来精确等值命中说明 SQL 端和 CLI 端的归一对齐。

## Agent 用法

talent-graph 仓库附带一组 Claude Code skill 模板和配套 prompt,让 agent 调用 CLI 完成"维护名单标签实体清单"、"批量收集别名"、"判定员工标签"等任务。**这些 skill / prompt 在 git 仓库里,不打包进 npm**——想用 agent 集成的话从仓库 `skills/` 和 `prompts/` 取。

### Layer A — 原子执行(由 Batch worker agent 调用)

| Skill | 用途 |
|-------|------|
| `/define-tag <domain> <标签名> [消歧]` | 增量维护一个名单标签的标准实体清单 |
| `/gather-entity-aliases <entity_type> <target_entity> <csv_path>` | 从一批候选 raw_name 中挑出属于目标实体的写法,写入 `entity_aliases` |
| `/attribute-raw-name <entity_type> <raw_name> [context_hint]` | 给定单个 raw_name,反向解析它归属哪个 entity(可能新建子 entity 挂 parent_id) |
| `/tag-employee <emp_id> <tag_list>` | 通读员工 profile 综合判决,hit 写入判定标签的 `employee_tag_map` |

`/define-tag` + `/gather-entity-aliases` + `/attribute-raw-name` 合起来维护名单标签的产线("tag → 标准实体 → 原始名变体"三层映射)。`/tag-employee` 是判定标签的执行单元,按 `tags.description` 写明的判决边界 prose 评判员工是否属于某 tag。

> **`/define-tag` 与 `/gather-entity-aliases` 以学校 / 公司场景为示例**给出了具体归属识别规则。其他 entity_type(产品 / 项目 / 城市等)使用者可参考 SKILL.md 结构改写自己的判决规则——通用执行框架对所有 entity_type 都适用。

### Layer B — 编排(由 DataPilot 主 session agent 调用)

| Skill | 用途 |
|-------|------|
| `/orchestrate-tagging` | 把 Layer A 的原子 skill 包装成可复用的批量任务(首次全量 / 周期增量 / 重判) |

CLI 本身完全独立,任何脚本 / AI 框架都能直接调用同一组命令完成同样工作——skill 只是 Claude Code / DataPilot 集成的便利层。员工数据的同步任务由调用方按其上游(数仓 / parquet / API 等)实现,不进 npm 包。

## 技术栈

- Drizzle ORM + PostgreSQL + pgvector(向量近义搜索)
- TypeScript + Bun(CLI 运行时)
- 可选:OpenAI 兼容 Embedding API(`EMBEDDING_BASE_URL` / `EMBEDDING_API_KEY` / `EMBEDDING_MODEL` / `EMBEDDING_DIMENSIONS`)

## 文档

| 文档 | 内容 | 是否随 npm 包发布 |
|------|------|-------------------|
| [`README.md`](README.md)(本文) | 工具是什么、装包/自托管两条路径、CLI 命令、字符归一化契约 | 是 |
| [`CLAUDE.md`](CLAUDE.md) | Agent 操作本工具的内部约定(单步执行、幂等、跳过原则、Skill 协作、踩坑约束) | 否 |
| [`skills/*/SKILL.md`](skills/) | 5 个 Agent skill 的判决依据与工作流 | 否 |
| [`prompts/`](prompts/) | 任务级业务定义模板(`define-tag` / `gather-entity-aliases` 等的 domain prose) | 否 |
| [`tests/README.md`](tests/README.md) | 测试基建(empty template + worker pool + truncate reset) | 否 |

npm 包定位是纯粹的 CLI / lib——schema setup、agent 集成、测试基建这些都在 git 仓库,需要时从仓库取。
