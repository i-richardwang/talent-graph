---
name: classify-entity-industry
description: 给一个公司实体判它属于哪些行业桶并逐桶挂载;一个实体可命中多个桶,挂载只作用于实体自身,主营查不清就不挂
argument-hint: <entity_id>
disable-model-invocation: true
---

给定**一个公司实体**,判它属于哪些雇主行业,把命中的行业桶逐个挂到这个实体上。挂上之后,下游按工作经历 JOIN 就能筛出"这段经历属于哪个行业"。

行业不是业内公认闭集(没有"所有银行"的权威名单),所以这是**逐实体分类**——判这一个实体本身属哪行,不是去枚举某个行业的成员清单。

**全自动执行**:不与人交互。判得准就挂,查不清就不挂——**不挂是正常结果,不是失败**。

任务: $ARGUMENTS

---

## 在管的行业桶

在管行业桶 = `facet=industry` 的那批 list 标签;`tag list --facet industry` 列出可挂的 `tag_code`。各桶的边界、什么算"实质业务"、一个实体能挂几个,按本次任务给定的归类判据来。

## 挂载

命中的桶逐个挂:

```bash
talent-graph tag link --tag <ind_code> --entity <entity_id> \
  --match-mode exact --reasoning "<判决依据>"
```

`--match-mode exact` 让归属只作用于**这个实体本身**、不沿父子链覆盖后代——所以判的也只是这个实体自身的主营,不是它母公司(菜鸟挂物流,不连带把阿里其它子公司拖进物流)。命中几个桶就 link 几次,重复 link 幂等。

## 失败处理

搜索工具不可用 / 失败 / 限流 → 终止任务,报错退出。**不要**当"查无源"跳过——会导致零写入但表面成功。
