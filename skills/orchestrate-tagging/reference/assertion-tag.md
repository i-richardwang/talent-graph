# assertion-tag: 判定标签综合判决(bootstrap + monthly)

> 本文是单个任务家族的 playbook。平台契约(mention 触发 / CSV 字段 / 并发锁 / 路径 / labels)和通用执行框架在 SKILL.md,这里只写本任务特有的展开。
>
> 本家族两个任务:`assertion-tag-bootstrap`(首次全员)与 `assertion-tag-monthly`(周期重判 cohort)。monthly 复用 bootstrap 的步骤 2-4,故同住一文件。

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
