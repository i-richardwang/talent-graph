#!/usr/bin/env bash
# C3 因果分析 · 边界(boundary,不可过度自信)。蓝本(快手/美团-商业分析)。
# 脱敏:仅换姓名(周慧敏)+ emp_id(D651097,逼真同格式);公司(快手/美团点评)、
#   学校(中国传媒大学)、work_list 全 verbatim,字数不压缩。
# 判定意图:美团段「价格弹性分析+补贴策略:通过 aa对照的回归分析区分…价格弹性,落地定价/补贴」——
#   简历里**确有**因果沾边的经历(用对照估干预效果、落地业务决策),但算不算命中取决于 description 没划清的
#   那条线(aa对照回归估弹性,既像相关性分析、又像带对照的效果估计)。这是 skill 三态里的典型「边界模糊」:
#   skip(严格:无点名因果方法)与 borderline(宽松:确有效果估计落地)**两种判法都站得住**,
#   唯一不可接受的是 confident(弱证据上夸大)。→ 测 Agent 在真实边界上不过度自信。
#   注:此 emp 在样本池本就归「边界模糊」桶;真·证据不足(干净 skip)的蓝本另案,不在本池。
# 预置:assertion tag「causal」(kind=skill)+ 员工 D651097。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

talent-graph tag add --code causal --name 因果分析 --mode assertion --kind skill \
  --description "判定边界:因果分析指为估计某个干预/动作的因果效应(treatment effect / uplift),使用能排除混淆、构造反事实的方法,并把结论落地业务决策(定价/补贴/营销等)。例如用随机实验(RCT/AB)数据,或对观测数据做去偏识别——IPW、PSM、DID、工具变量、双重机器学习、uplift 建模、因果森林、S/T/X-learner、反事实建模等。只描述相关关系或趋势、做无干预语义的预测建模(分类/回归)、或笼统说'数据驱动'而看不出如何识别因果效应的,不属于。" >/dev/null

bun "${SCRIPT_DIR}/_employee.ts" < "${SCRIPT_DIR}/causal-boundary.profile.json"
