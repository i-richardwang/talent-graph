---
name: orchestrate-tagging
description: 用 DataPilot Batch 和 Automation 编排 talent-graph 的标签生产任务（首次全量打标 / 周期增量扫描 / 重判）
argument-hint: <task-name>
disable-model-invocation: true
---

把 talent-graph 的四个单条处理 skill(`define-tag` / `gather-entity-aliases` / `attribute-raw-name` / `tag-employee`)通过 DataPilot Batch + Automation 包装成批量任务。

本 session 负责准备输入数据、创建 batch、启动执行,然后退出。后续的监控、加并发、处理失败由用户在 DataPilot UI 或 datapilot CLI 接手。

任务: $ARGUMENTS

---

## 任务索引

talent-graph 的标签分两类:**名单标签**(`tags.mode='list'`)维护"实体 ↔ 原始名称写法"的映射,**判定标签**(`tags.mode='assertion'`)按员工 profile 综合判定是否属于某个标签。名单标签的别名填充有两种方式:**按 target entity 批量收集**(`gather-entity-aliases`,适合 school 域——target 清单明确,按 target × 数据分片展开)和**按单条 raw 反向归属**(`attribute-raw-name`,适合 company 域——公司实体太多无法穷举 target)。每种方式各有"一次性首灌"和"周期增量"两种任务:

| 任务名 | 描述 | 触发方式 | 对应原子 skill |
|---|---|---|---|
| `define-tag-bootstrap` | 名单标签 字段注册 + 标准实体清单挂载 | 一次性 Batch | `define-tag` |
| `list-tag-bootstrap` | 名单标签 target-anchored 首次召回 raw_name | 一次性 Batch | `gather-entity-aliases` |
| `list-tag-weekly` | 名单标签 target-anchored 周期增量扫新 raw_name | Automation + Batch | `gather-entity-aliases` |
| `attribute-raw-name-bootstrap` | 名单标签 raw-anchored 首次反向归属 raw_name | 一次性 Batch | `attribute-raw-name` |
| `assertion-tag-bootstrap` | 判定标签 首次全员扫 | 一次性 Batch | `tag-employee` |
| `assertion-tag-monthly` | 判定标签 周期重判 cohort | Automation + Batch | `tag-employee` |

调用例: `/orchestrate-tagging assertion-tag-monthly`。任务名格式:标签类型(`list` / `assertion` / `attribute-raw-name`)+ 触发节奏(`bootstrap` / `weekly` / `monthly`)。

---

## DataPilot 平台契约

写 batch prompt template 和 input CSV 时必须遵守:

### 1. 触发原子 skill 用 mention 形式

batch worker 在独立 DataPilot session 里运行,**不识别 slash command**。在 prompt template 末尾触发 skill 必须用 mention 括号:

```
[skill:gather-entity-aliases] $BATCH_ITEM_ENTITY_TYPE $BATCH_ITEM_TARGET_ENTITY $BATCH_ITEM_RAW_NAMES_CSV_PATH
```

写成 `/gather-entity-aliases ...` 会被 worker 当纯文本,导致全部表面成功但实际零写入。

### 2. CSV 字段名 ASCII,引用大写

DataPilot 把 input CSV 字段以 `BATCH_ITEM_<FIELD_UPPER>` 注入 prompt。字段名必须 ASCII(`entity_type` ✓,`实体类型` ✗),引用 `$BATCH_ITEM_ENTITY_TYPE` 或 `${BATCH_ITEM_ENTITY_TYPE}`。

### 3. 不走 batch test,起步并发锁 1

talent-graph 的 batch 直接写生产库,test 模式也是真写——没有安全的预演机制。create 时在 `execution.maxConcurrency` 设 1 起步:万一 prompt 有误,脏数据只影响前 1-2 条,用户检查前几条结果后再调高。并发是 create-time 的 `execution` 字段,**`batch start` 不接受 `--concurrency` flag**(裸 `batch start <id>` 启动)。

### 4. Batch 状态的真值

`datapilot batch list` 是当前 batch 集合的真值。任务目录下的 `inputs/*creation-results*.txt` 是创建过程的回执,只追加不删除,带 `CREATE_FAILED` 行不代表当前真有失败——查 `batch list` 才知道。

要"补跑某些 batch"前,先用 `datapilot batch list` 按 batch name 前缀过滤,看哪些已存在;不存在的才需要新建。

### 5. 文件路径用绝对路径

`batch create` 的 `source.path`(input CSV),以及 input CSV 里指向其他文件的列(chunk 路径等),都用绝对路径——batch 引擎按 DataPilot workspace 解析路径,不是 orchestrator 的 cwd,相对路径会在 `batch start` 时 ENOENT。

### 6. labels 用已注册的 label ID

`batch create` 的 `labels` 只接受 DataPilot 预注册的 label ID,传未注册的名字或动态值(如把学校名当 label)整条 create 被 reject。用 `talent-graph` + 对应任务 label(`define-tag` / `list-tag` / `attribute-raw-name`);需要新 label 先在 DataPilot 配置里注册,不要把可变值塞进 labels。

---

## 执行框架(任意任务通用)

```
1. 准备输入数据 → CSV 落到 DP workspace inputs 目录
2. 写 prompt template → 把对应 prompts/ 下的场景文件内容复制进来,末尾追加 [skill:<skill名>] $BATCH_ITEM_*
3. datapilot batch create(execution.maxConcurrency=1 起步)
4. datapilot batch start <id>   →  报告用户后退出
```

报告内容:**batch-id + 总行数 + 已启动 concurrency=1 + 建议验证后加并发到几**(`list-tag-*` → 5,`assertion-tag-*` → 3,LLM 限流是瓶颈,数据库不是)。

---

## define-tag-bootstrap: 名单标签字段 + 实体清单首灌

业务方一次性把 N 个名单标签的 tag 字段注册 + 标准实体清单挂载完成。每个标签是一个独立 worker(WebSearch 核实清单 + entity 复用/新建 + tag link),N 个标签独立并行。

### 1. 准备 input data

业务方给一份 tag 名单(每行一个标签 + 可选消歧说明)。input CSV 字段 ASCII:

```csv
tag_id,kind,tag_name,disambiguation
1,school,清北,
2,school,C9,
3,school,985,
4,school,QS前100,锁定 2025 QS 世界大学排名
```

`disambiguation` 列可空——动态榜单 / 概念边界模糊的标签必填(参考 `prompts/define-tag/<scenario>.md` 各 scenario 的项目级约束)。

### 2. Prompt template

按标签 `kind` 选 scenario 文件整篇复制进 `prompt-define-tag.txt`——`school` 域用 `prompts/define-tag/school-tier-tag.md`,`company` 域用 `prompts/define-tag/notable-employer-tag.md`。末尾追加:

```
[skill:define-tag] $BATCH_ITEM_KIND "$BATCH_ITEM_TAG_NAME" "$BATCH_ITEM_DISAMBIGUATION"
```

worker 看不到 prompts/ 目录——项目级约束(动态榜单锁年份、模糊概念要消歧等)必须整篇复制进来。只写触发命令一行,worker 会凭训练记忆发挥,不去 WebSearch 核实。

### 3. 创建 + 启动

```bash
INPUT=$(jq -n --rawfile prompt prompt-define-tag.txt --arg csv "$(pwd)/inputs/define-tag-tags.csv" '{
  source: {type:"csv", path:$csv, idField:"tag_id"},
  action: {type:"prompt", prompt:$prompt},
  labels: ["talent-graph","define-tag"],
  execution: {maxConcurrency:1, retryOnFailure:true, maxRetries:2}
}')

datapilot batch create --name "define-tag-bootstrap school-tier" --input "$INPUT"
datapilot batch start <batch-id>
```

### 4. 报告用户

报告 batch-id + 总行数 + 已启动 concurrency=1 + 建议验证后加到 3(每个 worker 需要跑 WebSearch,比 list-tag-* 慢)。退出。

---

## list-tag-bootstrap: 名单标签首灌

仅用于 school 域(学校 entity 边界清晰,适合按 target 批量收集别名)。company 域走 `attribute-raw-name-bootstrap`——展开方式完全不同,不要套用这里的 target × 分片模式。

**每所 target 学校一个独立 batch**。每个 batch 把全量未归属 raw_name 切成 500 条一片,worker 拿到(一片数据 + target 学校)后通读,从 500 条里挑出属于该校的 raw 登记成 alias。

不预筛 raw_name(`alias add` 才是本任务的产物,用已有别名或标准名做预筛会在首灌期漏掉英文/缩写写法)。代价:同一条 raw 会被 N 所学校的 worker 各看一遍——可接受,`alias add` 幂等,属于谁就谁登记。

### 1. 准备 input data

**target 学校清单**——业务方工单指定要跑的 tag list(中文 tagName 或 ASCII tagCode 都可,orchestrator 用 `talent-graph tag list --kind school` 拿全集再匹配),抽各 tag 下挂的 entity canonical name 合并去重:

```bash
set -e   # fail-fast: tag_not_found 等错误不静默继续
for code in $TAG_CODES; do
  talent-graph tag members "$code" | jq -er '.data.members[].canonicalName'
done | sort -u > inputs/target-names.txt
```

`tag members` envelope 的 `data.members[]` 已含 `canonicalName`,无需再调 `entity get`。`jq -e` 在空输出时非零退出,触发 `set -e` 终止。

**全量未归属 raw_name 数据池**——sync changeset,bootstrap 用古早 since 取全量:

```bash
talent-graph sync changeset \
  --since "1970-01-01T00:00:00Z" \
  --out "exports/list-tag-bootstrap-$(date +%Y%m%d)" \
  --targets schools
```

产物 `school-raws.csv` = `employee_educations.school` LEFT JOIN `entity_aliases` IS NULL 的全量未登记快照(单列 `raw_name`)。

**切 chunk**(教育实体 chunk size = 500 硬编码,余数自然成最后一块,awk 跨平台兼容):

```bash
EXPORT="$(pwd)/exports/list-tag-bootstrap-$(date +%Y%m%d)"
CHUNKS="$EXPORT/chunks"
mkdir -p "$CHUNKS"
tail -n +2 "$EXPORT/school-raws.csv" | awk -v c="$CHUNKS" '
  NR % 500 == 1 { idx = sprintf("%04d", int((NR-1)/500))
                  out = c "/chunk-" idx ".csv"
                  print "raw_name" > out }
  { print >> out }
'
```

`%04d` 后缀位数支持到 10000 chunk(500 万行 raw 上限,首灌不会爆)。`$EXPORT` 用绝对路径。

**每所 target 学校一份 batch input CSV**(N 所学校共用同一组 chunks,只 target_entity 列不同;chunk_csv_path 必须是绝对路径——worker session cwd 与 orchestrator 不保证一致):

```csv
chunk_id,entity_type,target_entity,chunk_csv_path
0000,school,清华大学,<$EXPORT>/chunks/chunk-0000.csv
0001,school,清华大学,<$EXPORT>/chunks/chunk-0001.csv
...
```

`target_entity` 值若含逗号必须 CSV 引号包裹。下游读这份 CSV 用 RFC 4180 解析器——直接 `cut -d','` / `awk -F,` 会从引号内的逗号断裂(这一行写下来是因为面对 CSV 时常本能选最趁手的字符拆分,而 CSV 引号字段恰好是这类工具的盲区)。双引号或控制字符仍然要直接报错让用户处理。

### 2. Prompt template

把 `prompts/gather-entity-aliases/school-aliases.md` 整篇复制进 `prompt-list-tag.txt`,末尾追加:

```
[skill:gather-entity-aliases] $BATCH_ITEM_ENTITY_TYPE "$BATCH_ITEM_TARGET_ENTITY" $BATCH_ITEM_CHUNK_CSV_PATH
```

worker 看不到 prompts/ 目录——项目级约束(学校 entity = 学历教育归属,附中/附属医院/园区跳过)必须整篇复制进来。只写触发命令一行,worker 会把附中错误地 alias 到母校。

### 3. 创建 + 启动(N 所学校循环)

每所 target 学校独立 batch,batch name 带学校名(label 不接受动态值,见平台契约 §6),user 在 dashboard 可按 batch name 筛选哪所学校的进度:

```bash
while read target; do
  # target 用双引号包裹应对含逗号的学校名;若 target 自身含双引号,这条 awk 写法会破,改用 CSV writer。
  ls "$CHUNKS"/chunk-*.csv | awk -F/ -v t="$target" '
    BEGIN { print "chunk_id,entity_type,target_entity,chunk_csv_path" }
    { f=$NF; sub(/^chunk-/, "", f); sub(/\.csv$/, "", f); print f",school,\""t"\","$0 }
  ' > inputs/list-tag-"$target".csv

  INPUT=$(jq -n \
    --rawfile prompt prompt-list-tag.txt \
    --arg csv "$(pwd)/inputs/list-tag-${target}.csv" \
    '{
      source: {type:"csv", path:$csv, idField:"chunk_id"},
      action: {type:"prompt", prompt:$prompt},
      labels: ["talent-graph","list-tag"],
      execution: {maxConcurrency:1, retryOnFailure:true, maxRetries:2}
    }')

  BATCH_ID=$(datapilot batch create \
    --name "list-tag-bootstrap $target" \
    --input "$INPUT" \
    | jq -er .data.id)

  datapilot batch start "$BATCH_ID"
  echo "$target -> $BATCH_ID"
done < inputs/target-names.txt
```

`set -e` 配 `jq -e` 让 batch create 失败就终止整个循环,避免半路状态。

### 4. 报告用户

含:
- N 个 batch-id 清单(`target → batch-id` 对应表)
- 单 batch 规模:M = `school-raws.csv` 行数 / 500(向上取整)
- 总规模:N batch × M item
- 已起跑 concurrency=1
- 推荐验证后加到 5
- 提示:每个 batch name 都带学校名,dashboard 按 batch name 筛选监控

退出。

---

## list-tag-weekly: 名单标签周扫

### 1. 准备 Automation

```bash
datapilot automation create --event SchedulerTick \
  --input '{
    "name": "Weekly school normalize incremental",
    "cron": "0 2 * * 1",
    "timezone": "Asia/Shanghai",
    "labels": ["Scheduled", "talent-graph"],
    "actions": [
      {
        "type": "prompt",
        "prompt": "Use [skill:orchestrate-tagging] to run list-tag-weekly: weekly school incremental normalize."
      }
    ]
  }'
```

### 2. 触发后的 session 工作流

每周一 02:00 prompt session 启动,session 里:

1. **拉本周未登记 raw_names**(sync 必须先于本任务跑——changeset 读 PG 当前快照):

   ```bash
   talent-graph sync changeset \
     --since "$LAST_RUN_TS" \
     --out "exports/list-tag-weekly-$(date +%Y%m%d)" \
     --targets schools
   ```

   产物 `school-raws.csv`(单列 `raw_name`)= `employee_educations.school` LEFT JOIN `entity_aliases` IS NULL 的全量未登记快照。`--since` 由本任务自管(用上次跑完的 timestamp,首次取 sync 上线日);attribute 完一批 alias 表会增长,即使 `--since` 取古早值也不会重复处理。

2. **target 学校清单**沿用 list-tag-bootstrap 那份(对当前 list-mode 标签的挂载实体合并去重——同 bootstrap §1 第一段 CLI 链)。

3. 同 `list-tag-bootstrap` 步骤 1.切 chunk 起 - 4。报告落到 `datapilot automation history`,user 周一接力。

---

## attribute-raw-name-bootstrap: 反向归属批量首灌

仅用于 company 域(公司 entity 几乎无穷多,无法预先列出 target 走 list-tag-bootstrap 的按 target 收集模式)。每条 raw 独立研究 → 找到已有 entity 就 `alias add`;判定为独立子集团就 `entity add`(挂 parent_id) + `alias add`;吃不准跳过。

**每条 raw_name 一个 worker**(`prompts/attribute-raw-name/<scenario>.md` 约定一次只处理一条)。**不要把多条打包让 worker 循环**——研究单条已经是重活(WebSearch + 业务判定),循环会让单 worker 执行时间不可控,且失败时回滚粒度太大。

worker 写库不止 `alias add`,可能新建 entity 挂 parent_id(独立子集团场景)。worker 首次调写命令时 talent-graph CLI 会返回 `readonly_mode` 错误并提示 `TALENT_GRAPH_MODE=full`,worker 会自行在后续写命令前加上该前缀。

### 1. 准备 input data

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

### 2. Prompt template

把 `prompts/attribute-raw-name/subsidiary-lookup.md` 整篇复制进 `prompt-attribute.txt`,末尾追加:

```
[skill:attribute-raw-name] $BATCH_ITEM_ENTITY_TYPE "$BATCH_ITEM_RAW_NAME" "$BATCH_ITEM_CONTEXT_HINT"
```

worker 看不到 prompts/ 目录——项目级约束(独立子集团的判定标准、哪些仅产品独立的子品牌不达标)必须整篇复制进来。只写触发命令一行,worker 会凭训练记忆发挥,把仅产品独立的子品牌错误地挂 parent_id 当独立子集团。

### 3. 创建 + 启动

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

### 4. 报告用户

报告 batch-id + 总行数 + 已启动 concurrency=1 + 建议验证后加到 3(每个 worker 需要 WebSearch,比 list-tag-* 慢)。提示用户:跑完后检查 `entities` 和 `entity_aliases` 表新增量;对于"判定为子集团但母公司 entity 不在库里而跳过"的 raw,下一轮先确保母公司 entity 入库再回跑。退出。

### 父 entity 依赖处理

worker 判定 raw 属于某个母公司的子集团,但母公司的 entity 不在数据库里 → **跳过这条 raw,不要自行创建母公司 entity**。原因:本任务约定每条 raw 一个 worker,自行创建母公司超出了单条 raw 的范围,且多个 worker 同时创建同名母公司会产生竞争。母公司在下一轮 batch 里处理,或由业务方手工 `entity add` 后重跑这条 raw。

---

## assertion-tag-bootstrap: 判定标签首灌

### 1. 准备 input data

全员 emp_id 清单 + 待打 tag list。`$DATABASE_URL` 在 talent-graph 仓 `.env.local`:

```bash
psql "$DATABASE_URL" -c "COPY (SELECT emp_id FROM employees) TO STDOUT WITH CSV HEADER" > inputs/all-employees.csv
talent-graph tag list --mode assertion   # 业务方挑本批跑哪几个
```

batch input CSV(`tag_list` 引号包裹):

```csv
emp_id,tag_list
D000001,"quant_bg,regional_exp"
D000002,"quant_bg,regional_exp"
```

同一 batch 通常对所有员工跑同一组 tag——业务方分批策略决定哪些 tag 一起跑。**一批内的 tag 应同 `kind`**(全 `skill` 或全 `experience`):两类判定证据不同(技能看方法论、经验看业务情境),用不同 prompt,不要混批。用 `talent-graph tag list --mode assertion --kind skill` / `--kind experience` 分别拿清单。

### 2. Prompt template

按本批 tag 的 `kind` 选 prompt——技能批用 `prompts/tag-employee/skill-judgment.md`,经验批用 `prompts/tag-employee/experience-judgment.md`,整篇复制进 `prompt-assertion-tag.txt`,末尾追加:

```
[skill:tag-employee] $BATCH_ITEM_EMP_ID "$BATCH_ITEM_TAG_LIST"
```

worker 看不到 prompts/ 目录——项目级约束(该 kind 的证据口径 + 边界模糊也跳过)必须整篇复制进来。只写触发命令一行,worker 会凭常识替业务方判定模糊边界,导致下游群体分析失真。

### 3. 创建 + 启动

```bash
INPUT=$(jq -n --rawfile prompt prompt-assertion-tag.txt --arg csv "$(pwd)/inputs/all-employees.csv" '{
  source: {type:"csv", path:$csv, idField:"emp_id"},
  action: {type:"prompt", prompt:$prompt},
  labels: ["talent-graph"],
  execution: {maxConcurrency:1, retryOnFailure:true, maxRetries:2}
}')

datapilot batch create --name "assertion-tag-bootstrap" --input "$INPUT"
datapilot batch start <batch-id>
```

### 4. 报告用户

报告 batch-id + 总行数 + 已启动 concurrency=1 + 建议验证后加到 3(LLM 调用比 `list-tag-*` 多)。退出。

---

## assertion-tag-monthly: 判定标签月扫

### 1. 准备 Automation

```bash
datapilot automation create --event SchedulerTick \
  --input '{
    "name": "Monthly assertion-tag re-judge",
    "cron": "0 3 1 * *",
    "timezone": "Asia/Shanghai",
    "labels": ["Scheduled", "talent-graph"],
    "actions": [
      {
        "type": "prompt",
        "prompt": "Use [skill:orchestrate-tagging] to run assertion-tag-monthly: monthly assertion-tag re-judge."
      }
    ]
  }'
```

### 2. 触发后的 session 工作流

每月 1 号 03:00 prompt session 启动:

1. **拉 cohort**(sync 必须先于本任务跑):

   ```bash
   talent-graph sync changeset \
     --since "$LAST_RUN_TS" \
     --out "exports/assertion-tag-monthly-$(date +%Y%m%d)" \
     --targets emps
   ```

   产物 `emps.csv`(列: `emp_id,name,hr_status,trigger`)= 自 `--since` 以来"新员工 ∪ 简历更新员工" union,`trigger` 列标 `new` / `resume_updated` / `both`。`--since` 取上次本任务跑完的 timestamp(首次取上次 `assertion-tag-bootstrap` 的 timestamp)。

2. **拼 batch input CSV**——往 `emps.csv` 加 `tag_list` 列(本轮重判 tag 集合,所有员工同一组),其他列保留:

   ```csv
   emp_id,name,hr_status,trigger,tag_list
   D000001,张三,在职,resume_updated,"quant_bg,regional_exp"
   ```

   `name` / `hr_status` / `trigger` 不进 prompt 但留给后续人工 review。

3. 同 `assertion-tag-bootstrap` 步骤 2-4。报告落到 `datapilot automation history`,user 月初接力。

### cohort 边界

`changeset --targets emps` **不含** description 边界变了导致需要重判的员工。description 修订后想全员重判要单独跑 `assertion-tag-bootstrap` 路径(全员 dump),不要套本任务的增量。

`tag-employee` 默认**只追加、不撤销**——profile 变化后已不符合的员工重跑不会自动撤销标签。撤销走 `TALENT_GRAPH_MODE=full talent-graph employee tag-remove`(同事务写 audit_log 兜底),跑完后建议人工检查历史标签是否仍然成立。
