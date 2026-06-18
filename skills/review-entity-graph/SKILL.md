---
name: review-entity-graph
description: 复核并收口 company 实体图的结构质量——裂脑重复、子公司没挂母体的散落孤儿、用工法人壳、合资归错;检测器捞候选、回到 raw+员工岗位做 ground truth、用 entity merge/set-parent/rename/set-description 修
argument-hint: [检测器范围 / 具体实体或主体名]
disable-model-invocation: true
---

复核 talent-graph 里 **company 实体图的结构质量**,把错位收口。这是 `/attribute-raw-name` 逐条建实体的**事后兜底**——单条创建没有全局视野,日积月累会沉淀出四类结构错位:

- **裂脑重复**:同一家公司被建成两个实体——下游分别命中、member 数被稀释
- **散落孤儿**:子公司没挂到它母体上——断了父子链,母体的 `subtree` 标签圈不到它的员工
- **用工法人壳**:只是母公司的法人 / 用工主体,却被单立成一个实体——制造"这个壳有 N 人"的假象
- **合资归错**:合资公司挂到了错误的归属方

下游名单标签靠 `员工任职 → entity → 父子链(subtree)→ tag` 派生命中,实体位置错了,标签就**漏人或混人**——这是修这些错位的唯一理由,也是判断改动值不值得做的标尺。

**现有的实体位置默认是对的**——工作是校验、只修确有把握的错位,不是凭名字重排一套"更整齐的树"再覆盖。吃不准就不动:挂宽(留在更上层母体)损失小,改错损失大。

**执行环境**:这个 skill 由有库读权限的 Claude Code session(像现在这样)直接跑——自己连库查现状、做判决、用 CLI 写回。它**不是** batch worker 跑的原子 skill(隔离环境没有库直连),也因此不进 `/orchestrate-tagging` 编排。

任务: $ARGUMENTS

---

## 判决依据:回到 raw + 员工岗位,不信 canonical / description

实体的 `canonical_name` 和 `description` 是上游建实体时写的,可能把一条 raw 查成了同名的**另一家**——只拿这两个字段互相比对来 review 是循环论证。真身锚在**这个实体名下的 raw_name,以及这些 raw 背后真实员工的岗位**(`employee_work_experiences.position_title`)。用 `bun --env-file=.env.local` + `pg` 直连查(JS 模板里的 `​` 等转义由 JS 解释、PG 收到字面字符):

```js
const NORM = `btrim(regexp_replace(w.company_name,'[​‌‍﻿]','','g'),E' \t\n\r 　')`;
// 一个实体名下 raw 命中的去重员工数 + 岗位分布(判身份/归属的 ground truth)
await q(`SELECT w.position_title, count(DISTINCT w.emp_id) n
  FROM entity_aliases a
  JOIN employee_work_experiences w ON ${NORM} = a.raw_name
  WHERE a.entity_id = $1 AND a.entity_type='company'
  GROUP BY 1 ORDER BY 2 DESC`, [entityId]);
```

`company_name` 必须按 `src/db/normalize.ts` 的 `normalizeName`(剥零宽字符 + trim 含 NBSP / 全角空格)等价归一后再 JOIN——`entity_aliases.raw_name` 入库时归过,默认 `TRIM()` 只剥 ASCII 空白会静默漏命中。

岗位画像和实体声称的业务对不上(canonical 说是旅行搜索、人却全是通用平台岗),就是身份或归属存疑的信号。业务归属随时间变(并购 / 改名 / 拆分 / 出售),拿不准就 WebSearch 核实,不凭训练记忆判。

## 候选从哪来:扫全库捞信号,人逐个判

没有现成脚本——按错位类型对全量 company 实体跑只读扫描,捞出**候选**。捞出来的是 triage 候选、不是结论:**所有扫法都高召回、低精度**,每条都得回到上面的 raw + 员工岗位逐个核,没有纯自动判法。各类错位的信号和扫法精度(这是反复踩出来的经验,值得照着选扫法):

- **裂脑重复**:剥法人后缀(集团 / 股份 / 控股 / 有限公司…)取核心名分组、同核心名 >1 个实体 = 精度最高的信号(P1 主力);子串包含、`name_embedding` 向量近邻精度低(同业 / 番号 / 地区近义淹没),只配补充。
- **散落孤儿**:剥法人后缀取某集团品牌词作 hub,找 canonical 带该词、却不在该 hub 子树里的实体。
- **用工壳**:靠上面的岗位查——子实体名下员工岗位画像与母体无从区分、且无独立品牌 / 业务线特征,就是壳;不靠名字扫。

## 错位与修法(都只接 UUID,破坏性操作前先 `--dry-run` 核对)

**和另一个实体其实是同一家** → `entity merge` 收敛成一个。survivor 选**知名简称**那个(HR / 员工会用来指认这家雇主的最熟知名字),不是股票简称、不是法人全称。

**是另一家的一部分,但自身是有辨识度的独立业务** → `entity set-parent` 挂到母体下(默认 `subtree`,母体标签覆盖它)。`parent_id` 编码的是**持久归属**("它是不是某家的一部分"这种稳定事实),不是易变的内部组织架构 / 事业群——大集团常年重组,追架构是没尽头的维护、对圈人也无收益;中间层只保留稳定的品牌 / 业务节点,已解散的行政中间层拆掉、子实体直接上挂稳定母体。**合资**公司归到**实际控制 / 员工发薪运营的那一方**,不因"各占股"就留作孤儿。

**只是母公司的用工 / 法人壳** → `entity merge` 并回母体。判据是它**有没有独立存在的理由**:有辨识度的雇主品牌、或可独立分析的业务线(行业归类与母体不同)→ 留(即使员工不多);品牌已消亡 / 从来不是品牌、没有可独立分析的业务、员工岗位画像与母公司无从区分 → 壳,并回。**壳判据看品牌 / 业务线,不看员工多少。**

**标准名用错了**(用了股票简称 / 法人全称而非知名简称)→ `entity rename`;**description 写错了身份**(把别家身份写成自己)→ `entity set-description`。

## 反复出现的陷阱:同名不一定同一家

名字相同、缩写相同、description 看着像,**都不等于**同一家或有从属关系——这是污染最大的来源。判合并 / 挂父子前,得有 raw + 员工岗位 + WebSearch 真正对得上的证据;只凭名字像就连,会把不同员工群混进一个实体。已经**拆分独立、被出售剥离**的(母公司已不再控股),也不该再挂回去。

## 失败处理

搜索工具不可用 / 失败 / 限流 → 终止任务,报错退出。**不要**当"查无源"跳过——会零写入但表面成功。
