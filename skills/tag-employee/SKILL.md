---
name: tag-employee
description: 给定一个员工 ID 和一组标签,通读员工的教育/工作/简历信息综合判定,命中的写入 employee_tag_map
argument-hint: <emp_id> <tag_list>
disable-model-invocation: true
---

给定一个员工的 ID 和一组待判定的 tag,通读员工的完整 profile(教育经历、工作经历、简历原文),对每个 tag 判断**该员工是否属于它**,把"属于"的判定写入 `employee_tag_map` 并标置信度。

"属于"分两档写入(`confident` / `borderline`),"不属于"跳过不写。三个结果各自锚在什么:

| 结果 | 什么时候 |
|---|---|
| `confident`(写入) | profile 里有本人**做了这个 tag 核心动作本身**的经历,且对照 `description` 清楚达标 |
| `borderline`(写入) | 做了核心动作,但**算不算达标取决于 `description` 没划清的那条线**;reasoning 里点名是哪条线 |
| 跳过(不写) | 没做这个核心动作本身,或做了但 `description` 明确排除 |

核心动作 = `description` 定义的那件事本身。**身份(岗位 / 团队 / 公司)、相邻但不同的事、只把该主题当话题提及,都不算"做了"**,一律跳过。

`borderline` 锚在 **`description` 没划清的线**,不锚在你的把握——"只是沾边 / 我不太确定"不是 `borderline`,是没做、跳过。

**全自动执行**:本 skill 不与人交互。

任务: $ARGUMENTS

---

## 目标

给定:
- `<emp_id>`: 员工 ID
- `<tag_list>`: 逗号分隔的 tag 标识列表,每项是 tagCode 或 tagName 都可以(如 `量化背景,区域工作经验` 或 `quant_bg,regional_exp`);两个字段都比一遍。省略时报错——不要默认拉全员所有 tag,明确范围避免无意义判定

对每个 tag 综合判定,按上面三态决定写不写、写什么置信度。

本 skill 只处理判定标签——`mode='list'` 的名单标签不在范围内。

---

## 判定依据

- **`tags.description` 是唯一的判定标准**——业务方写明的判定边界(如"量化背景 = 数学/统计/物理/CS 学位 + 量化金融或算法岗履历")。严格按 description 判定,不要凭常识或个人偏好在 description 之外补充条件
- **profile 全部维度都要看**:教育、工作经历、简历原文一起看;某个维度缺失(比如员工没简历)是正常的,按现有的维度判
- **依据要直接**:description 说"量化金融岗履历",profile 里要找到具体的对应经历;不能靠间接推测("在金融机构 → 可能做量化"这种推理不算,没有明确经历就跳过)

---

## 注意事项

- **只记录"属于"**——`confident` 和 `borderline` 都是"属于",都写入;"不属于"不写,不要挂起等待
- **profile 只拉一次**——`employee get <emp_id>` 只调一次,对所有 tag 统一通读判定
- **占位 description 跳过该 tag**:tags.description 是必填字段,但如果内容是"TODO"或几个字的占位文本,显然无法据此判定,跳过该 tag(不写)并向调用方报告
- **不撤销、不降级已有的标签**:即使本次判定为不属于但表里已有记录,不要自动 `employee tag-remove`;tag-add 对已挂的也幂等、不会改既有 confidence——从"属于"变"不属于"、或 confident↔borderline 的变动通常意味着 profile 发生了实质变化(转岗/学历更新),撤销 / 改判应走人工确认
- **`resume.workList` 是 JSON 字符串而非数组**:自己解析后通读其中的 description / jobResp 等富文本字段;解析失败时跳过 resume 维度,按 workExperience + education 判

---

## 信息源

- `tag list --mode assertion` 拿待判 tag 的 description(判定标准)。tag 标识可能是 tagCode 也可能是 tagName,两个字段都比一遍
  - 部分 `<tag_list>` 标识无对应 → 警告但继续(处理找到的)
  - 全部找不到 → 终止任务,报错退出
- `employee get <emp_id>` 拿 profile:工作经历 / 教育经历 / 最新简历 / 已挂 tag 清单
  - `tags[]` 是该员工已挂的 tag——本轮 `<tag_list>` 中已在其中的直接跳过判定
  - `employee_not_found` → 跳过整个任务,正常退出并报告
  - 其他非预期的返回状态(`internal_error` 等)→ **不要**当作"信息不足"跳过——工具报错和 profile 信息缺失是两回事,按返回的 `data.hint` 行动,必要时终止任务报错退出

---

## 写入

```bash
talent-graph employee tag-add --emp <emp_id> --tag <tagId> \
  --confidence <confident|borderline> --reasoning "<判定依据>"
```

- `--confidence`:清楚达标填 `confident`,达标线没划清填 `borderline`(不传默认 `confident`)。不属于 / 没做 / 只沾边的**不调用本命令**。
- `--reasoning` 一句话写清:profile 里的哪段经历或哪条学历做了 description 的核心动作、并怎么达标;**`borderline` 时还要点名是哪条达标线没划清**——后续人工核查、重判、以及业务方迭代 description 的关键依据。

通读 profile 后批量调用,不要每个 tag 一次 Bash 往返。
