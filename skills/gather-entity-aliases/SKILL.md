---
name: gather-entity-aliases
description: 给定一个目标 entity 和一份候选清单,把指向它的所有写法登记到 entity_aliases
argument-hint: <entity_type> <target_entity> <csv_path>
disable-model-invocation: true
---

`entity_aliases` 表收录业务数据里实际出现过的、指向某个 entity 的所有名称写法。本任务给定一个 entity 和一份候选清单,把清单里指向它的每一种写法都登记进去——target 自己的标准名也算(它也是业务数据里出现过的一种写法)。不指向 target 的跳过。

**全自动执行**:本 skill 不与人交互。判断有把握就直接写(含冲突时 `--force` 覆盖),没把握就跳过。

任务: $ARGUMENTS

---

## 目标

给定:
- `<entity_type>`:实体类型(`school` / `company`)
- `<target_entity>`:目标 entity 的名字(如 `清华大学` / `字节跳动`)
- `<csv_path>`:单列 `raw_name` 的候选清单(数据来源不在本 skill 范围;你通读整份清单逐条判断)

把 CSV 里指向 target 的每条写法登到 `entity_aliases`,其余跳过。

---

## 识别规则

判定一条 raw 是否归属 target,只问两个维度:

**算归属——指向 target 这个主体的所有写法**:

- **target 名字的字面变形**(官方全称、官方简称、英文名、typo、简繁 / 全半角 / 大小写 / 空格差异):raw 就是 target 名字本身的另一种写法——直接写 alias,不需要搜
- **下属机构**(研究院 / 学院 / 子公司 / 分公司 / 部门;默认归属母体,具体例外见任务 prompt):**先用搜索工具核实归属再写**——即使你认为是常识也要搜,实际归属随时间变(并购 / 改名 / 拆分),凭记忆判会出错
- **历史身份**(曾用名 / 改名前身 / 并购前身):同上,**先用搜索工具核实再写**

**不归属(跳过)——挂着 target 名但实际不是 target**:

- **同名不同主体**:同名但不同地区 / 不同集团(如国立清华大学台湾 vs 清华大学北京)——先用搜索工具核实后跳过
- **挂了 target 的名字但实际不属于 target**:具体哪些算"挂名不归属",由任务 prompt 定义。不同领域标准不同(比如 school 域看是否提供学历教育、company 域看是否独立运营),这些由 prompt 指定

---

## 处理要点

- **通读整份 CSV**,不要 grep / filter 挑子集——字面不含 target 关键字但实际指向 target 的写法(如 `五道口金融学院` / `水木清华` 之于清华)只有通读才能发现
- **子 entity 优先**:如果 raw 指向的是 target 的某个子 entity,不要挂到 target 上,跳过(它应该挂在子 entity 上)
- **只判当前 target**:CSV 里指向其他实体的 raw,不顺手登记
- **历史登记有误直接 `--force` 覆盖**,不留人工断点(全自动判断)
- **prompt 没给业务定义就保守**:任务 prompt 没明示哪些"挂名不归属"时,只登 target 自己的写法和下属机构,其他存疑跳过——不要凭常识猜业务边界

---

## 信息源

- `entity search "<target_entity>" --type <entity_type>` 拿 target 的 entityId;找不到精确匹配 → `entity add --canonical-name "<target_entity>" --type <entity_type>` 先注册再继续
- `entity get <entityId>` 返回的 `description`(实体身份 + 并购/改名等历史)、`aliases[]`(已登记的写法)、`children[]`(已注册的子 entity)都可以作为判断依据

---

## 写入

```bash
talent-graph alias add --type <entity_type> \
  --raw-name "<原始名>" --entity <target-entityId> \
  --reasoning "<判断依据>"
```

整份 CSV 通读完后批量调用,不要每条一次 Bash 往返。

`conflict_needs_force`:返回结果给出 `data.existing.entityId`,调 `entity get <existing.entityId>` 看其 `parentId`:

- existing 的 `parentId` 指向 target → 不覆盖,跳过(raw 已挂在 target 的子 entity 上)
- existing 与 target 无层级关系,本次有可靠依据支持归属 target → `--force` 覆盖
- 吃不准 → 跳过

---

## 失败处理

搜索工具不可用 / 失败 / 限流 → 终止任务,报错退出。不要当"查无源"跳过——会导致零写入但表面成功。
