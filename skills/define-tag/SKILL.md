---
name: define-tag
description: 增量维护一个业务标签的字段和挂载实体清单
argument-hint: <domain> <标签名> [消歧说明]
disable-model-invocation: true
---

增量维护一个**名单标签**(`mode='list'`,如`藤校` / `MBB`):包括 tag 本身的字段(写入 `tags`,`mode='list'` + `domain` 必填)和挂在这个 tag 下的标准实体清单(写入 `tag_entity_map`)。

**全自动执行**:单个实体判断有把握直接写、没把握跳过。唯一会暂停等调用方介入的情形是清单本身权威性不成立。

任务: $ARGUMENTS

---

## 目标

给定:
- `<domain>`:实体类型(`school` / `company`),写入 `tags.domain`,与 `entities.entity_type` 同值空间
- `<标签名>`:业务标签中文名(如 `藤校` / `MBB` / `985`)
- `[消歧说明]`:口径约束(可选,用于歧义标签,如"大厂 = 市值前 10 中国互联网公司")

进来先看数据库当前状态,再决定这一轮做什么:
- **tag 不存在** → 新建 tag 字段
- **tag 已存在但元数据要改**(description 补充等)→ 暂无 tag update 命令,跳过
- **确保实体存在** → `entity search` 找已有;找不到 → `entity add` 新建
- **把实体挂到 tag 上** → `tag link`
- **把实体从 tag 上解绑** → `tag unlink`

数据库里已有的数据不需要关心来源——只看当前状态,产出本轮的增量变更。

---

## 通用识别规则

### tag 字段

**`code`** — 英文 snake_case(`ivy_league` / `mbb` / `big_four`)。纯数字可以(`985`)。

**`name`** — 中文标签名。

**`mode` / `domain`** — 本 skill 始终走 `--mode list --domain <domain>`(直接用任务参数 `<domain>`)。同一 tag 下所有挂载实体必须满足 `entity.entity_type = tag.domain`,schema 层拦跨域挂载。

**`description`** — 一句话讲清业务含义。

### entity 字段

`canonicalName` 用行业里最常用的名称,中英文均可。同名实体用 `description` 区分。

`description` 一行,格式 `<英文官方名> — <层次定位>,<地理位置>`,例:`Harvard University — 常春藤盟校,马萨诸塞州剑桥`。

---

## 判决依据

**tag 字段本身**(code / name / domain / description 业务口径):可以按消歧说明 + 常识定,不需要 WebSearch。

**"X 实体是否归属这个 tag"**:
- 业内公认的稳定清单(藤校 8 所、MBB 3 家、C9 具体哪 9 所)→ **必须用 WebSearch 核实一遍**,不用训练记忆兜底
- 冷门实体查不到一手或二手资料 → 跳过该实体(不挂),不猜

跳过是安全退出——不挂 = 下游查询不命中 = 不会污染下游。

---

## 执行流程

### 1. 查 tag 现状

```bash
talent-graph tag members <code>
```

成功返回当前挂的实体清单（用 `canonicalName` 作为本轮 web 搜索清单的对账主键，`reasoning` 是上次入选依据，`matchMode` 决定挂载是否含子树）。`status=tag_not_found` → 本轮要先 `tag add`，再基于空 members 做增量。

### 2. WebSearch 建立本轮事实基线

搜官方名单 / 权威榜单发布方官方页 → 列出本轮应挂的实体集。用户在任务上下文已附权威资料 → 直接用,不必再搜。

**先判"清单本身是否成立",再谈具体挂哪几家**:

- **有权威发布方或业内公认定义**(教育部 985 / 双一流名单、常春藤盟校、MBB 三家、红圈所、G5 等)→ 本轮事实基线直接作数,继续往下走
- **多份榜单口径显著冲突 / 无权威发布方 / 概念边界模糊**("大厂" / "独角兽" / "头部 XX" / "新常春藤"多版本等)→ 终止任务,报错退出。这一步卡住时**不建 tag、不挂任何实体、不做任何写操作**——范围模糊的标签硬挂 = 污染所有下游查询

清单成立后,和数据库现状对比产出本轮动作:

- **缺的**(应挂、数据库没挂)→ 走下面的"加挂"路径
- **一致的** → 跳过
- **多的**(数据库挂了、本轮清单没有)→ 自主判断:有可靠资料支持该实体确实不再属于这个清单就解绑,不确定就跳过
  ```bash
  talent-graph tag unlink --tag <code> --entity <entityId>
  ```

### 3. 新建 tag(若不存在)

```bash
talent-graph tag add --code <code> --name <name> \
  --mode list --domain <domain> \
  --description "<...>"
```

### 4. 逐条加挂实体

对每个本轮应挂的实体:

**4a. 确保实体存在**：先 `entity search "<candidate>" --type <domain>`，`data.exact[]` 里有 `canonicalName === "<candidate>"` 的条目就复用其 `entityId`；无精确匹配再 `entity add`：

```bash
talent-graph entity add --type <domain> \
  --canonical-name "<name>" --description "<...>"
```

**4b. 挂到 tag**：`--reasoning` 写一句话入选依据（回查"上一轮为什么把这家挂进来"的关键线索）：

```bash
talent-graph tag link --tag <code> --entity <entityId> \
  [--match-mode <exact|subtree>] --reasoning "<入选依据>"
```

`--match-mode` 决定挂载在实体层级里的覆盖范围,默认 `subtree`(此实体 + 所有后代),可显式传 `exact`(仅此实体本身)。判断依据是**本 tag 业务定义的覆盖范围,不是实体层级本身**:tag "互联网公司" 挂阿里巴巴 → 业务希望覆盖整个集团 → `subtree`;tag "物流" 挂菜鸟 → 业务只圈这一家 → `exact`。已挂实体的 match_mode 可用同条 `tag link` 直接改,不必先 unlink 再 link(改 match_mode 不是破坏性变更)。

---

## 失败处理

分两种级别:

- **WebSearch 调用失败**(网络 / 限流 / 异常)→ 终止任务,报错退出。**不要**当"查无源"跳过——会导致零写入但表面成功
- **清单本身不成立**(多份榜单口径冲突 / 无权威发布方 / 概念边界模糊)→ 终止任务,报错退出。输出本轮搜到的主要来源、各自的清单与口径差异,交给调用方决策;调用方给消歧说明(任务参数的 `[消歧说明]` 位,例:"大厂 = 市值前 10 中国互联网公司")后重跑
- **单个实体查不到一手或二手资料**(冷门实体)→ 该实体跳过(不挂),不猜。不挂 = 下游查询不命中,不会污染数据

---

## 注意

- **逐条单步**:本轮就做本轮要做的那几条加/解绑,不管数据库里其他数据从哪来;没有批量接口
- **实体复用优先**:挂到 tag 之前先 `entity search` 找已有的;不要新造"哈佛大学 (USA)" 这种变体重复实体
- **证据不足宁可跳过**:不挂 = 下游查询不命中,不会污染下游。强行挂有误 = 污染所有下游查询
