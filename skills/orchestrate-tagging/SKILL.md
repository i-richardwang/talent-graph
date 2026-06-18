---
name: orchestrate-tagging
description: 用 DataPilot Batch 和 Automation 编排 talent-graph 的标签生产任务（首次全量打标 / 周期增量扫描 / 重判 / 实体分类）
argument-hint: <task-name>
disable-model-invocation: true
---

把 talent-graph 的五个单条处理 skill(`define-tag` / `gather-entity-aliases` / `attribute-raw-name` / `classify-entity-industry` / `tag-employee`)通过 DataPilot Batch + Automation 包装成批量任务。

本 session 负责准备输入数据、创建 batch、启动执行,然后退出。后续的监控、加并发、处理失败由用户在 DataPilot UI 或 datapilot CLI 接手。

任务: $ARGUMENTS

---

## 任务索引:从你面对的场景找任务

你(orchestrator)接到的是业务方一句自然语言工单——说要做什么、覆盖什么范围,**不一定报得出任务名**。先在下表对号入座:看你面对的是哪种场景,落到任务名,再读它的 playbook。

| 你面对的场景 | 任务名 | 读这个 playbook |
|---|---|---|
| 业务方刚定义了一批名单标签(清北 / MBB…),库里还没挂标准实体——要给每个标签注册字段、研究并挂上它的标准实体清单 | `define-tag-bootstrap` | `skills/orchestrate-tagging/reference/define-tag.md` |
| 名单标签的标准实体清单已挂好(典型是**学校**,target 清单明确),要把简历库里这些实体出现过的各种写法都收集登记成 alias —— **首次全量** | `list-tag-bootstrap` | `skills/orchestrate-tagging/reference/list-tag.md` |
| 同上,但只扫本周期新增的未登记写法 | `list-tag-weekly` | `skills/orchestrate-tagging/reference/list-tag.md` |
| 手上是一堆**原始公司名**(公司实体无穷多、列不出 target),要逐条反查每个 raw 归属哪个公司实体、登记 alias(判定为独立子集团就新建) —— **首次全量** | `attribute-raw-name-bootstrap` | `skills/orchestrate-tagging/reference/attribute-raw-name.md` |
| **公司实体已经建好**,要给每个实体判它属哪个行业 + 是不是平台、挂上行业/模式标签 —— **首次全量** | `classify-entity-industry-bootstrap` | `skills/orchestrate-tagging/reference/classify-entity-industry.md` |
| 要按**员工 profile** 综合判定打判定标签(技能 / 经验类) —— **首次全员** | `assertion-tag-bootstrap` | `skills/orchestrate-tagging/reference/assertion-tag.md` |
| 同上,但只重判本周期的 cohort(新员工 + 简历更新过的) | `assertion-tag-monthly` | `skills/orchestrate-tagging/reference/assertion-tag.md` |

定位到任务后,**读对应 playbook 拿该任务的具体步骤**(准备 input → prompt template → batch create → 报告)。本文只承载所有任务通用的平台契约和执行框架。playbook 路径与下文 prompt template 引用的 `prompts/<skill>/<scenario>.md` 同为 repo 根相对。读不到 playbook 或 prompt 就报错停下、不要凭记忆硬编命令——零写入比错写入好。

> 任务名怎么记:`<标签类型/skill>`(`define-tag` / `list-tag` / `attribute-raw-name` / `classify-entity-industry` / `assertion-tag`)+ `<触发节奏>`(`bootstrap` 首次 / `weekly` / `monthly`)。一个原子 skill 对应一个 reference 文件;周期变体(weekly / monthly)和它的 bootstrap 同住一文件。

---

## DataPilot 平台契约

写 batch prompt template 和 input CSV 时**所有任务都**必须遵守:

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

`batch create` 的 `labels` 只接受 DataPilot 预注册的 label ID,传未注册的名字或动态值(如把学校名当 label)整条 create 被 reject。用 `talent-graph` + 对应任务 label(`define-tag` / `list-tag` / `attribute-raw-name` / `classify-entity-industry`);需要新 label 先在 DataPilot 配置里注册,不要把可变值塞进 labels。

---

## 执行框架(任意任务通用)

```
1. 准备输入数据 → CSV 落到 DP workspace inputs 目录
2. 写 prompt template → 把对应 prompts/ 下的场景文件内容复制进来,末尾追加 [skill:<skill名>] $BATCH_ITEM_*
3. datapilot batch create(execution.maxConcurrency=1 起步)
4. datapilot batch start <id>   →  报告用户后退出
```

报告内容:**batch-id + 总行数 + 已启动 concurrency=1 + 建议验证后加并发到几**(`list-tag-*` → 5,`assertion-tag-*` / `attribute-raw-name-*` / `classify-entity-industry-*` → 3,LLM 限流是瓶颈,数据库不是)。

各任务在这个骨架上的具体差异(input 怎么准备、选哪个 prompt 文件、报告补充什么)见各自的 `skills/orchestrate-tagging/reference/<file>.md`。
