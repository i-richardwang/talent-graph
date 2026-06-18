# attribute-raw-name-bootstrap: 反向归属批量首灌

> 本文是单个任务的 playbook。平台契约(mention 触发 / CSV 字段 / 并发锁 / 路径 / labels)和通用执行框架在 SKILL.md,这里只写本任务特有的展开。

仅用于 company 域(公司 entity 几乎无穷多,无法预先列出 target 走 list-tag-bootstrap 的按 target 收集模式)。每条 raw 独立研究 → 找到已有 entity 就 `alias add`;判定为独立子集团就 `entity add`(挂 parent_id) + `alias add`;吃不准跳过。

**每条 raw_name 一个 worker**(`prompts/attribute-raw-name/<scenario>.md` 约定一次只处理一条)。**不要把多条打包让 worker 循环**——研究单条已经是重活(WebSearch + 业务判定),循环会让单 worker 执行时间不可控,且失败时回滚粒度太大。

worker 写库不止 `alias add`,可能新建 entity 挂 parent_id(独立子集团场景)。worker 首次调写命令时 talent-graph CLI 会返回 `readonly_mode` 错误并提示 `TALENT_GRAPH_MODE=full`,worker 会自行在后续写命令前加上该前缀。

## 1. 准备 input data

业务方工单指定本批跑哪些 raw——不替业务方决定范围。常见形式:全量(冷启动期不实际)/ 频率 top-N / 指定清单 / 按群组限定。

**raw 池来源**:

```bash
talent-graph sync changeset \
  --since "1970-01-01T00:00:00Z" \
  --out "exports/attribute-raw-name-bootstrap-$(date +%Y%m%d)" \
  --targets companies
```

产物 `company-raws.csv` = `employee_work_experiences.company_name` LEFT JOIN `entity_aliases` IS NULL 的全量未登记快照(单列 `raw_name`)。

**频率 top-N 选择**(业务方工单常见要求):按 raw 在 `employee_work_experiences` 出现的 distinct emp 数排序,取 top-N(覆盖大头员工经历)。`$DATABASE_URL` 在 talent-graph 仓 `.env.local`:

```bash
psql "$DATABASE_URL" -c "
  SELECT we.company_name AS raw_name, COUNT(DISTINCT we.emp_id) AS emp_count
  FROM employee_work_experiences we
  LEFT JOIN entity_aliases a
    ON a.entity_type='company' AND a.raw_name=we.company_name
  WHERE a.id IS NULL AND we.company_name IS NOT NULL AND we.company_name <> ''
  GROUP BY we.company_name
  ORDER BY emp_count DESC
  LIMIT $TOP_N
" -tAF',' --csv > inputs/company-raws-top.csv
```

**batch input CSV**(`raw_name` 必选,`context_hint` 可选——业务方工单要求带就拼 work_experience 的 position_title / country / 时间段):

```csv
raw_id,entity_type,raw_name,context_hint
1,company,字节跳动(上海),
2,company,菜鸟网络,
3,company,某基金管理有限公司,Senior Analyst in 北京 2018-2022
```

`context_hint` 列为空时 worker 纯靠 raw 研究;非空时多一份语境信息,有助区分同名公司。`raw_name` 含逗号 / 双引号需 CSV 引号包裹(`alias add` 内部 normalizeName 会剥首尾空白,但写 CSV 时仍要按标准转义)。

## 2. Prompt template

把 `prompts/attribute-raw-name/subsidiary-lookup.md` 整篇复制进 `prompt-attribute.txt`,末尾追加:

```
[skill:attribute-raw-name] $BATCH_ITEM_ENTITY_TYPE "$BATCH_ITEM_RAW_NAME" "$BATCH_ITEM_CONTEXT_HINT"
```

worker 看不到 prompts/ 目录——项目级约束(独立子集团的判定标准、哪些仅产品独立的子品牌不达标)必须整篇复制进来。只写触发命令一行,worker 会凭训练记忆发挥,把仅产品独立的子品牌错误地挂 parent_id 当独立子集团。

## 3. 创建 + 启动

```bash
INPUT=$(jq -n --rawfile prompt prompt-attribute.txt --arg csv "$(pwd)/inputs/company-raws-top.csv" '{
  source: {type:"csv", path:$csv, idField:"raw_id"},
  action: {type:"prompt", prompt:$prompt},
  labels: ["talent-graph","attribute-raw-name"],
  execution: {maxConcurrency:1, retryOnFailure:true, maxRetries:2}
}')

datapilot batch create --name "attribute-raw-name-bootstrap company top-$TOP_N" --input "$INPUT"
datapilot batch start <batch-id>
```

## 4. 报告用户

报告 batch-id + 总行数 + 已启动 concurrency=1 + 建议验证后加到 3(每个 worker 需要 WebSearch,比 list-tag-* 慢)。提示用户:跑完后检查 `entities` 和 `entity_aliases` 表新增量;对于"判定为子集团但母公司 entity 不在库里而跳过"的 raw,下一轮先确保母公司 entity 入库再回跑。退出。

## 父 entity 依赖处理

worker 判定 raw 属于某个母公司的子集团,但母公司的 entity 不在数据库里 → **跳过这条 raw,不要自行创建母公司 entity**。原因:本任务约定每条 raw 一个 worker,自行创建母公司超出了单条 raw 的范围,且多个 worker 同时创建同名母公司会产生竞争。母公司在下一轮 batch 里处理,或由业务方手工 `entity add` 后重跑这条 raw。
