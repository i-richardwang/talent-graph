# talent-graph — Agent 操作约定

工具的定位、CLI 命令清单、数据模型、安装步骤见 [README.md](README.md)。本文只承载 **Claude Code Agent 操作本工具时的内部约定**——单步执行的判断模式、幂等与跳过原则、Skill 协作方式、容易踩坑的 schema 约束。

---

## Tag 的两种模式

talent-graph 的 tag 分两种,**业务语义和写入路径完全不同**,由 `tags.mode` 显式标注。`tags.domain` 在名单标签下记录挂载实体类型(对齐 `entities.entity_type`),判定标签下为 NULL:

| | 名单标签 (`mode='list'`) | 判定标签 (`mode='assertion'`) |
|---|---|---|
| **`tags.mode`** | `'list'` | `'assertion'` |
| **`tags.domain`** | 必填(`school` / `company` / ...) | NULL |
| **tag 是什么的集合** | 实体清单 | 员工清单 |
| **员工怎么命中** | 下游 JOIN 实时派生:`employee.work.company → entity_aliases → entity → tag_entity_map → tag`(走 `match_mode`,见下) | 直接读 `employee_tag_map` |
| **谁维护** | 业务方研究阶段(`/define-tag`),低频 | AI 流水线运行时(`/tag-employee`),高频 |
| **判决依据** | 业务共识 + WebSearch 核实 | 员工 profile 综合分析 + `tags.description` 边界 prose |
| **改动后果** | 改 `tag_entity_map` → 下游 JOIN 命中实时变 | 改 `tags.description` → 已写入的 `employee_tag_map` 不动,需重判覆盖 |
| **维护命令** | `tag link / unlink --tag <code> --entity <uuid> [--match-mode]` | `employee tag-add / tag-remove --emp <emp_id> --tag <code>` |
| **事实存储** | `tag_entity_map`(含 `match_mode`) | `employee_tag_map` |

**两种模式的命令命名空间不交叉**:名单标签在 `tag` noun 下(维护实体清单是"tag 的事"),判定标签在 `employee` noun 下(打/撤员工标是"employee 的事")。Agent 调用时 verb 选对了,target flag 也就对了——不会把员工 ID 传给 `tag link`,也不会把 entity UUID 传给 `employee tag-add`。

**模式不可变**:`tag add` 时一次性决定(`--mode list --domain <T>` 或 `--mode assertion`)。同 `tag_code` 重复 `tag add` 时 `(mode, domain)` 不一致直接 `tag_mode_conflict`,要改模式只能新建 tag。

### 实体层级 + match_mode

`entities.parent_id` 表达实体的从属关系(如阿里巴巴 → 菜鸟 / 天猫 / 蚂蚁)。`tag_entity_map.match_mode` 决定挂载是否覆盖后代:

| match_mode | 命中范围 | 典型用法 |
|---|---|---|
| `'subtree'` (默认) | 此实体 + 所有后代(沿 parent_id 向下)| 互联网公司 → 阿里巴巴(subtree)→ 菜鸟员工也命中 |
| `'exact'` | 仅此实体本身 | 物流 → 菜鸟(exact)→ 不会让阿里巴巴所有员工都进物流 |

下游 JOIN 走 `match_mode = 'exact' AND entity_id = X` 或 `match_mode = 'subtree' AND <X 的祖先链中包含 entity_id>`(用 recursive CTE 沿 parent_id 向上)。父子实体必须同 `entity_type`(CLI 在 `entity add --parent` 拦跨域)。

---

## 输出协议: 单一 envelope JSON

**stdout 永远只输出一个 JSON envelope**——agent 解析直接 `JSON.parse(stdout)` 一次到位,不做 plain-text 切分。人类可读的进度 / 警告走 stderr。

```jsonc
{
  "ok": true,            // exit code 的 JSON 镜像 (true ↔ exit 0)
  "status": "created",    // 命令侧离散闭集 (见各命令);分支判决用这个,不读 ok
  "data": { /* 命令产物 */ },
  "meta": { "command": "entity.add" }
}
```

### 失败也是 envelope

`ok: false` 同样落 stdout 一个完整 envelope (然后 exit 1)。绝大多数 status 自带 `data.hint`,按 hint 行动即可。下面只列**需要项目策略加持**(envelope hint 不足以决定下一步)的少数几条:

- `*_not_found` (`entity_not_found` / `tag_not_found` / `employee_not_found`):**不要重试**也不要换 query 兜底,这是硬 miss,直接报告调用方
- `conflict_needs_force` (`alias add`):Agent 自主裁决——有可靠源支持本次归属 → 重跑加 `--force` 覆盖;吃不准 → 跳过,不覆盖
- `tag_mode_conflict` (`tag add`):同 `tag_code` 复用但 `(mode, domain)` 与既有不一致——**mode 与 domain 不可变更**,改用新 `tag_code` 或先删旧 tag

其他 status (`wrong_tag_mode` / `cross_domain_rejected` / `readonly_mode` / `internal_error` 等) 按 envelope `data.hint` 行动即可,无项目层额外策略。

### 字段命名

所有 PK 字段都带 owner 前缀,跨命令拼接不会撞名:

- `tagId` / `tagCode` (永远不是裸 `id`)
- `entityId` / `canonicalName`
- `aliasId`
- `empId`
- `auditId`

成员/挂载计数字段一律叫 `memberCount`(`tag list` 每行 + `tag get` 单条都用同名)。

### --tag 取值

所有写命令 (`tag link` / `tag unlink` / `employee tag-add` / `employee tag-remove`) 和 `audit list --tag` 的 `--tag` flag 同时接受 tag_code (字面 `mbb`) 和 tag UUID,内部 resolveTag 自动判别。Skill 里看到混用是有意的——agent 手上有什么用什么,无需再做一次查询拿另一种形式。

### 前置自检: `db diag`

任何自动化 / batch / 脚本流的第一步:

```bash
talent-graph diag
```

`db diag` 是 ops/部署侧的环境自检命令(连通性 + 扩展 + 能力快照)。Agent 在跑任务前可以瞄一眼 `data.database.reachable`,但不要 gate 在其他能力字段上——CLI 的工具语义会在内部能力降级时优雅降级,Agent 调用什么命令就关心那个命令的 envelope 就行。

---

## 操作模式:单步、幂等、跳过

CLI 全部是单条原子命令,**不提供批量接口**(无 `alias add-bulk` / `import-csv` 等)。Agent 的工作模式统一是:

```
查 DB 现状 → 本地判决 → 单条命令增量写
```

批量场景(全量打标 / 周期重判 / 大型榜单初灌)由 `/orchestrate-tagging` 通过 DataPilot Batch + Automation 编排,原子 skill 被 fan-out 到 batch worker 单步执行。

### 幂等 vs 冲突

CLI 写操作幂等:重复同名 / 重复同组合返 `already_*` (`ok: true`),不报错,Agent 直接拿现有 ID。真正需要 Agent 决策的冲突按 envelope `data.hint` + `data.suggestions[]`(若有)行动——`similar_exists` 自带可执行 hint(reuse / adjust / `--force-new`)+ suggestions,Agent 凭语义自判;需要项目策略加持的少数 status 见上方"失败也是 envelope"列表。

### 证据不足时跳过,不要猜测

`entity_aliases` 是**正向 mapping**(只登记"是这个实体"),没登记的天然 JOIN 不命中。

- **漏打**:不污染数据(JOIN 时 raw_name 匹配不上,自然丢弃)
- **错打**:污染所有下游查询

→ **判决置信度不足时的默认动作是"跳过",不是"猜测"**。这一原则贯穿两个 skill:`/define-tag` 里"清单本身不成立时非零退出等消歧",`/gather-entity-aliases` 里"无可靠源就跳过"。

### entity add 的合约

`entity add` 内部用相似度检查防同义实体被重复创建。Agent 按 envelope `status` 分支即可:`created` / `already_exists` / `similar_exists`——相似度怎么算是 CLI 内部细节。

### 破坏性操作走 audit_log 兜底

`tag unlink`(物理 DELETE)和 `alias add --force`(覆盖式 UPDATE)在**同事务内**先把被操作行的旧值写进 `audit_log`,再执行破坏性操作。事务保证日志和操作要么都成、要么都失败。

正常 `*-add` / 幂等 / upsert **不入表**——audit_log 的定位是"兜底恢复 + 反查误操作",不是全量操作流水。Agent 层无感知,只有工程/运维查错时走 `talent-graph audit list`。

### WebSearch 失败 vs 查无源

两个 skill 都允许 Agent 用 WebSearch 核实判决依据。要区分两种"没结论":

- **查无源**(搜了但找不到可靠资料)→ 跳过该实体,继续下一条
- **调用失败**(网络 / 限流 / 异常)→ **整 task 非零退出**,不要当"查无源"跳过(会变零写入 + 表面成功)

---

## Skill 协作

`skills/` 下 5 个 skill,各自处理一类任务:

| Skill | 维护表 | 用途 |
|-------|--------|------|
| `/define-tag <domain> <标签名> [消歧]` | `tag_entity_map`(主)、`tags`(新建 tag 时)、`entities`(实体未注册时新建) | 增量维护一个名单标签的标准实体清单 |
| `/gather-entity-aliases <entity_type> <target_entity> <csv_path>` | `entity_aliases`(主)、`entities`(target 未注册时新建) | 给定一个标准实体和一片候选 raw_name 清单,挑出属于该实体的写法 |
| `/attribute-raw-name <entity_type> <raw_name> [context_hint]` | `entity_aliases`(主)、`entities`(B 类建子 entity) | 给定一个 raw_name,解析它归属哪个 entity(可能新建子 entity 挂 parent_id) |
| `/tag-employee <emp_id> <tag_list>` | `employee_tag_map` | 通读员工 profile 综合判决,hit 写入判定标签 |
| `/orchestrate-tagging <task-name>` | (调度本身) | 用 DataPilot Batch + Automation 把上面四个原子 skill 包装成批量任务(任务名:`list-tag-bootstrap` / `list-tag-weekly` / `assertion-tag-bootstrap` / `assertion-tag-monthly`) |

`/define-tag` + `/gather-entity-aliases` + `/attribute-raw-name` 合起来维护名单标签的产线("tag → 标准实体 → 原始名变体"三层映射)。后两者是同一 entity↔raw 映射问题的两个方向：`/gather-entity-aliases` 锚在 target entity（"这片候选 raw 里哪些属于我？"），`/attribute-raw-name` 锚在 raw_name（"我属于哪个 entity？可能要新建子 entity 挂 parent"）——前者用于已有 target 批量收集别名，后者用于单个 raw 反向解析（含层级建模）。`/tag-employee` 是判定标签的执行单元,读 `tags.description` 写明的判决边界 prose,通读 `employee get` 返回的 profile 综合判决。

### 调度方式

- **`/define-tag`**:业务方触发。少量标签逐个跑(直接 `/define-tag <domain> <标签名>`),大批量首灌走 `/orchestrate-tagging define-tag-bootstrap`(N 个独立标签 fan-out 并行);名单变化由业务方周期性复审驱动(每年 / 每季度重跑一次,DB 现状 vs 当前清单产出 link/unlink 增量)
- **其他三个原子 skill**(`/gather-entity-aliases` / `/attribute-raw-name` / `/tag-employee`):工作单元可枚举(target × csv / 未登记 raw / emp × tag),由 `/orchestrate-tagging` 编排批量执行

### 通用 method 在 SKILL,domain 业务在 prompt,实体特有信息在 description

判决依据分四类,各有各的归宿:

- **通用 method**(如 gather 的"通读整片 CSV、字符变体凭直觉、其他归属外部核实、写入冲突裁决")写在 `skills/*/SKILL.md`——SKILL 是 domain-agnostic 的,不预设 domain 业务边界,谁有这个 domain 的任务谁在 prompt 给定义
- **domain 业务定义**(如 school 的"挂母校名但不培养本校校友的不归属"、company 的"B 类只接受拆分独立上市子集团")写在对应的 `prompts/<skill>/<scenario>.md`——SKILL 不重复
- **实体特有的事实性历史**(并购 / 改名 / 前身等)并入 `entities.description`,`talent-graph entity get <uuid>` 返回时一并带回,Agent 判决时作背景参考
- **每个 tag 的判决边界**写入 `tags.description`,`/tag-employee` 判决判定标签时按那个 prose 判,无跨 tag 通用规则

---

## 容易踩坑的 Schema 约束

### entity_type 与 tags.domain 是任务域分区键

`entities.entity_type` 与 `entity_aliases.entity_type` 是 entity 子类(`school` / `company` / `product` / ...)。`tags.domain` 在名单标签上对齐同一值空间——决定这个 tag 下能挂哪类实体,**同一名单标签下所有挂载实体必须满足 entity.entity_type = tag.domain**(CLI 在 `tag link` 拦跨域链接,在 `entity add --parent` 拦跨域父子)。

`entity_aliases` 的 UNIQUE 是 `(entity_type, raw_name)`——**不同 entity_type 完全独立**。同名 raw(如"清华大学"既是 school 又是 company)在不同 entity_type 下可分别挂、不冲突。下游 JOIN 必须带 `entity_type` 过滤,否则会跨域误命中。

### 实体层级不能跨 entity_type

`entities.parent_id` 是自引用 FK(ON DELETE SET NULL)。**父子必须同 entity_type**(school 不能作为 company 的父),否则 `tag_entity_map.match_mode='subtree'` 的 JOIN 会跨域漂移。CLI 在 `entity add --parent` 时校验,业务侧维护层级时按域分别建。

### 字符归一化契约必须两端对称

入库前 `src/db/normalize.ts` 的 `normalizeName` 剥首尾空白(含 NBSP / 全角空格)+ 零宽字符。**调用方下游 JOIN 必须做等价归一化**——多数 SQL 引擎默认 `TRIM()` 只剥 ASCII 空白,漏剥会静默漏命中。具体见 README 的"字符归一化契约"章节。

不做的归一化:全半角 / 大小写 / 繁简 / 内部空格——这些是真实语义变体,靠 `entity_aliases` 的行穷举覆盖。

### alias 表登记业务里见过的每一种写法

`entity_aliases` 是真实写法的观测记录。业务数据里见过的所有 raw 都该登记成 alias,包括跟 entity 标准名字面相同的那种——它也是一种业务真实写法,字面跟标准名同还是不同不影响登记决策。`alias add` 只看 raw 是不是业务里真实写过的,不挑写法是不是"特殊"。

### entities.description 兼任两用

`description` 字段同时承担:身份说明(用来同名实体消歧)+ 事实性历史(并购 / 改名 / 前身)。schema 是 nullable text——`/define-tag` 研究 tag 实体清单时一并填好(传 `--description`);`/attribute-raw-name` B 类建子 entity 时填一行身份卡片;`/gather-entity-aliases` 补建实体时不传,数据库存 `NULL`,后续 `/define-tag` 维护 tag 时再丰富。

`tags.description` 反过来是硬必填——schema `NOT NULL` + CLI `tag add` 必传 `--description` 且拒绝空白字符串。它是业务方写明的判决边界 prose,`/tag-employee` 的判决依据,空了无法判。

---

## 文档分工

| 文档 | 视角 | 内容 | 随 npm 包发 |
|------|------|------|-------------|
| [README.md](README.md) | 工具使用者 | 工具是什么、装包/自托管两条路径、6 张表、CLI 命令、字符归一化契约 | 是 |
| CLAUDE.md(本文) | 仓库内 Agent 操作 | 单步幂等模式、跳过原则、Skill 协作、容易踩坑的 schema 约束 | 否 |
| `skills/*/SKILL.md` | Agent 判决 / 编排 | 各 skill 的 method-level 流程与判决依据(domain-agnostic);`.claude/skills` 是软链兼容 Claude Code 自动加载 | 否 |
| `prompts/*` | 任务调用方 | domain 业务定义 + 任务级具象指引,orchestrator 调用 skill 时附加;详见 `prompts/README.md` | 否 |
| `evals/<skill>/` | better-skills eval 任务 workspace | `evals.json` + `prompts/` + `seed/` + `setup-reset-db.sh`;调用时 `--skill-path skills/<skill>` `--workspace evals/<skill>`(better-skills 0.6 起 skill_path 与 workspace 必须分离);`iteration-N/` 是 `better-skills iterate / run` 的产物,gitignore | 否 |
| [`tests/README.md`](tests/README.md) | Agent 写测试 | 测试基建架构(empty template + worker pool + truncate reset)、写新 spec 模板、已显式拒绝的方向 | 否 |

npm 包只发 `dist/` + `LICENSE` + `README.md`(包定位是纯 CLI / lib)。skill / prompt / evals / tests / docker / migrations 都留在 git 仓库,自托管或想用 agent 集成的人从仓库取。
