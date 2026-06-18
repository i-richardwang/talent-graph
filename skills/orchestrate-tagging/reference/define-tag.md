# define-tag-bootstrap: 名单标签字段 + 实体清单首灌

> 本文是单个任务的 playbook。平台契约(mention 触发 / CSV 字段 / 并发锁 / 路径 / labels)和通用执行框架在 SKILL.md,这里只写本任务特有的展开。

业务方一次性把 N 个名单标签的 tag 字段注册 + 标准实体清单挂载完成。每个标签是一个独立 worker(WebSearch 核实清单 + entity 复用/新建 + tag link),N 个标签独立并行。

## 1. 准备 input data

业务方给一份 tag 名单(每行一个标签 + 可选消歧说明)。input CSV 字段 ASCII:

```csv
tag_id,kind,tag_name,disambiguation
1,school,清北,
2,school,C9,
3,school,985,
4,school,QS前100,锁定 2025 QS 世界大学排名
```

`disambiguation` 列可空——动态榜单 / 概念边界模糊的标签必填(参考 `prompts/define-tag/<scenario>.md` 各 scenario 的项目级约束)。

## 2. Prompt template

按标签 `kind` 选 scenario 文件整篇复制进 `prompt-define-tag.txt`——`school` 域用 `prompts/define-tag/school-tier-tag.md`,`company` 域用 `prompts/define-tag/notable-employer-tag.md`。末尾追加:

```
[skill:define-tag] $BATCH_ITEM_KIND "$BATCH_ITEM_TAG_NAME" "$BATCH_ITEM_DISAMBIGUATION"
```

worker 看不到 prompts/ 目录——项目级约束(动态榜单锁年份、模糊概念要消歧等)必须整篇复制进来。只写触发命令一行,worker 会凭训练记忆发挥,不去 WebSearch 核实。

## 3. 创建 + 启动

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

## 4. 报告用户

报告 batch-id + 总行数 + 已启动 concurrency=1 + 建议验证后加到 3(每个 worker 需要跑 WebSearch,比 list-tag-* 慢)。退出。
