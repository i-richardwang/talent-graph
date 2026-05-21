---
name: attribute-raw-name
description: 判定一个 raw_name 归属哪个 entity——已有归属正确就不动，需要介入时挂到已有 entity、新建下级 entity 或标记为无法识别
argument-hint: <entity_type> <raw_name> [context_hint]
disable-model-invocation: true
---

给定**一个 raw_name**,判定它在 talent-graph 里应该归属哪个 entity:**已有归属正确就不动**,还没归属或归属有误才介入。

数据库里已有的归属默认是对的——你的工作是校验它,不是重新算一份"更精确的答案"再覆盖。

**全自动执行**:本 skill 不与人交互。判决路径明确就直接写,吃不准就跳过。

任务: $ARGUMENTS

---

## 输入

- `<entity_type>`: 实体类型(`school` / `company`)
- `<raw_name>`: 待解析的原始写法
- `[context_hint]`: 可选,歧义场景的辅助过滤条件(如"出现在 2018 年简历、地点上海")

---

## 判决流程

### 第一步:查现状

跑 `entity search "<raw>" --type <entity_type>`,看 raw 在数据库里的状态。三种情况:

**A. raw 已经挂在某个 entity 下**(search 返回的 entity 把 raw 列在它的别名里)

校验当前归属是不是最合适的:用搜索工具查清 raw 的真实业务归属,逐层 `entity search` 看数据库有没有对应 entity,取最精细的那个。

跟当前归属比对:

- **找到的最精细 entity == 当前归属** → 归属正确,任务结束
- **找到的最精细 entity ≠ 当前归属**(当前挂在了更上层的祖先上,数据库里有更精确的 entity)→ `alias add --force` 改挂到更精确的那个
- **归属链上数据库里完全没有对应 entity**(当前归属跟实际业务无关,只是名字碰巧相似的误挂)→ 走第三步重新判定 + force 覆盖

业务归属随时间变(并购 / 改名 / 拆分),即使常识也要搜核实,不要凭训练记忆判。

**B. raw 还没挂,但数据库里有合适的 entity 可挂**

直接挂上:

```bash
talent-graph alias add --type <entity_type> \
  --raw-name "<raw>" --entity <entity_uuid> \
  --reasoning "<判决依据>"
```

拿不准时优先挂到更上层的 entity(挂母公司而非子公司)——挂得宽损失小,挂错损失大。

**C. raw 在数据库里完全没有相关记录,也没看到合适的 entity** → 进第二步

### 第二步:raw 是真实主体,还是无法识别的脏数据?

系统里预置了两个特殊 entity,专门归类无法正常归属的数据:

- **本身就不是真实主体**(占位词 / 隐去名 / `某X` 这类指代)→ **挂到「（无效输入）」**(不必搜)
- **搜后查无资料、各来源说法不一致、看不懂的代号** → **挂到「（无法识别）」**

操作方式:先 `entity search "（无效输入）" --type <entity_type>` 或 `entity search "（无法识别）" --type <entity_type>` 拿 UUID,再用第一步 B 的 `alias add` 挂上去。剩下的真实主体 → 进第三步。

### 第三步:查业务归属,决定层级

用搜索工具查清 raw 的真实身份和业务归属。raw 自身就是有独立市场认知的公司 → 直接建顶层 entity 无 parent,挂 alias 完工。

raw 属于某集团旗下的子业务/子品牌 → 沿归属链向上逐层 `entity search`,找数据库里最近的祖先 entity。直接所属集团不在数据库里不代表停止——继续往上找。按数据库里有没有祖先分两种走法:

#### 数据库里能找到祖先

看祖先 entity 的 canonical 名 + description:

- **祖先 entity 的业务就是 raw 所属的业务**(从 canonical + description 能看出这个 entity 专做这一块)→ **直接挂到祖先**(同第一步 B 的 alias add)
- **祖先是跨多条业务线的集团,raw 是其中一条独立业务** → **在祖先下新建一个下级 entity 挂 parent**:

```bash
talent-graph entity add --type <entity_type> \
  --canonical-name "<品牌名>" \
  --description "<一行身份卡片>" \
  --parent <ancestor_uuid>

talent-graph alias add --type <entity_type> \
  --raw-name "<raw>" --entity <child_uuid> \
  --reasoning "<判决依据>"
```

新建 entity 的 canonical 用最常见的品牌名(不要用 raw 里带法人后缀的全称写法),方便同一 entity 下未来的别名归拢到一起。

拿不准时不拆分,直接挂到祖先——挂到上层损失小。

#### 数据库里找不到任何祖先

一次性把需要的所有层级都建出来,**自上而下**挂好 parent:

```bash
# 1. 先建最顶层(无 parent)
talent-graph entity add --type <entity_type> \
  --canonical-name "<顶层品牌名>" \
  --description "<一行身份卡片>"

# 2. 逐层往下 add,每层挂上一层的 uuid 作 parent
talent-graph entity add --type <entity_type> \
  --canonical-name "<下一层品牌名>" \
  --description "<一行身份卡片>" \
  --parent <上一层 uuid>

# 3. 最后挂 alias
talent-graph alias add --type <entity_type> \
  --raw-name "<raw>" --entity <raw 实际归属层 uuid> \
  --reasoning "<判决依据>"
```

每建一层前先 `entity search` 确认数据库里没有——如果已经存在,按上面"数据库里能找到祖先"的逻辑处理。

每层 `canonical` 取该层最常见的品牌名(同上新建 entity 的取名方式)。

---

## 失败处理

- **搜索工具不可用 / 失败 / 限流** → 终止任务,报错退出。**不要**当"查无源"跳过——会导致零写入但表面成功
- **搜索后找不到相关结果 / 各来源说法不一致** → 挂「（无法识别）」

---

## alias add 撞 `conflict_needs_force`

说明第一步的现状校验漏掉了——回到第一步 A,检查当前归属是不是业务归属链上最合适的 entity。
