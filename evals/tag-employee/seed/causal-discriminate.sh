#!/usr/bin/env bash
# C2 因果分析 · 同 profile 判别(命中 + 不命中)。蓝本(字节/拼多多-数据分析)。
# 脱敏:仅换姓名(林文轩)+ emp_id(D823145,逼真同格式);公司(字节/拼多多/多多买菜)、
#   学校(哥伦比亚大学)、work_list 全 verbatim,字数不压缩。
# 判别意图(同一 profile,两个标签各自独立判):
#   - causal 命中 confident:多多买菜段「因果推断:…协变量匹配搭配双重差分,自动化回收实验效果」
#     —— 协变量匹配(PSM)+ 双重差分(DID),观测数据去偏的明确因果方法,干净命中。
#   - recrank 不写:profile 仅「行业商品搭配推荐」作为专项分析*话题*出现,无召回/排序/CTR 模型实操
#     —— 测 skill-judgment「话题提及 ≠ 方法实操」这条线,Agent 应跳过、不写。
# 预置:assertion tag「causal」+「recrank」(均 kind=skill)+ 员工 D823145。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

talent-graph tag add --code causal --name 因果分析 --mode assertion --kind skill \
  --description "判定边界:因果分析指为估计某个干预/动作的因果效应(treatment effect / uplift),使用能排除混淆、构造反事实的方法,并把结论落地业务决策(定价/补贴/营销等)。例如用随机实验(RCT/AB)数据,或对观测数据做去偏识别——IPW、PSM、DID、工具变量、双重机器学习、uplift 建模、因果森林、S/T/X-learner、反事实建模等。只描述相关关系或趋势、做无干预语义的预测建模(分类/回归)、或笼统说'数据驱动'而看不出如何识别因果效应的,不属于。" >/dev/null

talent-graph tag add --code recrank --name 推荐排序 --mode assertion --kind skill \
  --description "判定边界:推荐排序指亲手构建或调优过推荐/搜索系统中'从海量候选里选出并排序'的模型环节,例如召回(协同过滤、向量、多路)、粗排/精排/重排、CTR/CVR 预估建模、相关特征工程与在线 serving 等。只是在'推荐团队/推荐方向'任职、或把'商品推荐/搭配推荐'当业务分析话题谈及而看不出本人做过模型环节的,不属于。" >/dev/null

bun "${SCRIPT_DIR}/_employee.ts" < "${SCRIPT_DIR}/causal-discriminate.profile.json"
