# classify-entity-industry-bootstrap: 公司实体行业 + 商业模式分类首灌

> 本文是单个任务的 playbook。平台契约(mention 触发 / CSV 字段 / 并发锁 / 路径 / labels)和通用执行框架在 SKILL.md,这里只写本任务特有的展开。

给每个**已建好的公司实体**判两条轴并逐个挂标签:**行业轴**(`facet='industry'`,可命中多个桶)+ **模式轴**(`facet='business_model'`,是不是 `平台`)。挂上之后,下游按工作经历 JOIN 就能筛"这段经历属于哪个行业 / 是不是平台型公司"。

**底数是 entity universe,不是 raw 池**——这是它和 `attribute-raw-name-bootstrap` 的根本区别。attribute 处理"没登记的原始公司名"(把 raw 接到 entity);本任务处理"已经是标准实体的公司"(给 entity 贴行业/模式标)。两者前后衔接:attribute 先把 raw 收敛成 entity,本任务再给 entity 分类。所以本任务跑的前提是公司实体已大体建齐。

行业 + 模式都不是业内公认闭集(没有"所有银行"的权威名单),所以**严禁用 `/define-tag`**——这是逐实体分类,judge 每个实体本身。

**每个 entity 一个 worker**。研究单个实体(读 description + 可能 WebSearch + 双轴判定)已是重活,不要把多个实体打包让 worker 循环。worker 写 `tag link --match-mode exact`,首次调写命令会撞 `readonly_mode` 并提示 `TALENT_GRAPH_MODE=full`,worker 自行在后续写命令前加该前缀。`--match-mode exact` 让分类只作用于实体自身,不沿父子链漂移(菜鸟挂物流,不连带把阿里其它子公司拖进物流)。

## 1. 准备 input data

业务方工单指定本批跑哪些实体——不替业务方决定范围。常见形式:全量(所有 company 实体)/ 频率 top-N(覆盖大头员工经历的实体)/ 指定清单。

**全量实体来源**:

```bash
talent-graph entity list --type company \
  | jq -r '.data[] | [.entityId, .canonicalName] | @csv' \
  > inputs/company-entities.body.csv
{ echo 'entity_id,canonical_name'; cat inputs/company-entities.body.csv; } > inputs/company-entities.csv
```

`entity list` 的 `data[]` 含 `entityId` / `canonicalName` / `description`。CSV 只需带 `entity_id`(worker 触发用)+ `canonical_name`(batch 可读 / debug);**description 不进 CSV**——worker 凭 entity_id 跑 `talent-graph entity get <uuid>` 现取 description,薄了再 WebSearch(skill 自带此流程),避免把 2.9 万条长 description 塞进 CSV 还要逐条转义。

**频率 top-N 选择**(业务方工单常见要求):按实体的所有 alias 在 `employee_work_experiences` 命中的 distinct emp 数排序,取 top-N(先分类大头雇主)。`$DATABASE_URL` 在 talent-graph 仓 `.env.local`:

```bash
psql "$DATABASE_URL" -c "
  SELECT e.id AS entity_id, e.canonical_name, COUNT(DISTINCT we.emp_id) AS emp_count
  FROM entities e
  JOIN entity_aliases a ON a.entity_id = e.id AND a.entity_type='company'
  JOIN employee_work_experiences we ON we.company_name = a.raw_name
  WHERE e.entity_type='company'
  GROUP BY e.id, e.canonical_name
  ORDER BY emp_count DESC
  LIMIT $TOP_N
" -tAF',' --csv > inputs/company-entities-top.csv
```

**已分类实体可选剔除**(重跑省算力,`tag link` 幂等故不剔也安全):首灌期行业/模式桶全 0 挂载,无需剔;增量轮想跳过"已判过的实体",在上面查询加 `AND NOT EXISTS (SELECT 1 FROM tag_entity_map m JOIN tags t ON t.id=m.tag_id WHERE m.entity_id=e.id AND t.facet IN ('industry','business_model'))`。

**batch input CSV**(`entity_id` 必选,`canonical_name` 仅供可读):

```csv
entity_id,canonical_name
19316c2b-9955-488e-a994-8e7d2246c8b3,同策集团
2ca45b98-9823-412e-9a1a-3ec7ec0f9bdb,招商银行
```

## 2. Prompt template

把 `prompts/classify-entity-industry/employer-industry.md` 整篇复制进 `prompt-classify.txt`,末尾追加:

```
[skill:classify-entity-industry] $BATCH_ITEM_ENTITY_ID
```

worker 看不到 prompts/ 目录——项目级约束(双轴判据:行业桶边界、平台继承所服务行业、数字原生桶 vs 现实行业的反例、沾边不挂、泛称无实据=主营查不清→不挂)必须整篇复制进来。只写触发命令一行,worker 会凭训练记忆乱归桶、把"在线"一律塞进数字桶、或把查不清的泛称公司硬判一个桶。

## 3. 创建 + 启动

```bash
INPUT=$(jq -n --rawfile prompt prompt-classify.txt --arg csv "$(pwd)/inputs/company-entities-top.csv" '{
  source: {type:"csv", path:$csv, idField:"entity_id"},
  action: {type:"prompt", prompt:$prompt},
  labels: ["talent-graph","classify-entity-industry"],
  execution: {maxConcurrency:1, retryOnFailure:true, maxRetries:2}
}')

datapilot batch create --name "classify-entity-industry-bootstrap company top-$TOP_N" --input "$INPUT"
datapilot batch start <batch-id>
```

> `labels` 里 `classify-entity-industry` 须是 DataPilot 预注册的 label ID(见 SKILL.md 平台契约 §6);未注册先在 DataPilot 配置里加,或暂时只用 `["talent-graph"]`。

## 4. 报告用户

报告 batch-id + 总行数 + 已启动 concurrency=1 + 建议验证后加到 3(每个 worker 可能 WebSearch,比 list-tag-* 慢)。提示用户:跑完后查挂载从 0 增长——`talent-graph tag list --facet industry` 和 `--facet business_model` 看各桶 `memberCount`;抽查几个实体 `entity get <uuid>` 看挂的桶对不对,再决定加并发。**"查不清就不挂"是正常结果**——大量无名 SME 本就判不出行业,零挂载不是失败。退出。
