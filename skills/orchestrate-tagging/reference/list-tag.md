# list-tag: 名单标签 target-anchored 别名召回(bootstrap + weekly)

> 本文是单个任务家族的 playbook。平台契约(mention 触发 / CSV 字段 / 并发锁 / 路径 / labels)和通用执行框架在 SKILL.md,这里只写本任务特有的展开。
>
> 本家族两个任务:`list-tag-bootstrap`(首次全量)与 `list-tag-weekly`(周期增量)。weekly 复用 bootstrap 的切 chunk - 创建 - 报告流程,故同住一文件。

仅用于 school 域(学校 entity 边界清晰,适合按 target 批量收集别名)。company 域走 `attribute-raw-name-bootstrap`——展开方式完全不同,不要套用这里的 target × 分片模式。

---

## list-tag-bootstrap: 名单标签首灌

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

每所 target 学校独立 batch,batch name 带学校名(label 不接受动态值,见 SKILL.md 平台契约 §6),user 在 dashboard 可按 batch name 筛选哪所学校的进度:

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
