#!/usr/bin/env bash
# C1 因果分析 · clean-hit。蓝本(美团-履约算法策略)。
# 脱敏:仅换姓名(陈思远)+ emp_id(D907312,与真实同格式、逼真);公司(美团/三快)、学校(北邮)、
#   work_list 全保真,jobResp 2035 字不压缩。
# 证据(jobResp):随机实验 / treatment / listwise 干预 / 因果去偏(permutation weighting)/ s-learner /
#   半参数因果模型 / uplift / 通用因果森林 / rct —— 多重明确因果方法,干净命中。
# 预置:assertion tag「causal」(因果分析, kind=skill)+ 员工 D907312。
# 期望:/tag-employee 判 confident 命中(tag-add --confidence confident)。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

talent-graph tag add --code causal --name 因果分析 --mode assertion --kind skill \
  --description "判定边界:因果分析指为估计某个干预/动作的因果效应(treatment effect / uplift),使用能排除混淆、构造反事实的方法,并把结论落地业务决策(定价/补贴/营销等)。例如用随机实验(RCT/AB)数据,或对观测数据做去偏识别——IPW、PSM、DID、工具变量、双重机器学习、uplift 建模、因果森林、S/T/X-learner、反事实建模等。只描述相关关系或趋势、做无干预语义的预测建模(分类/回归)、或笼统说'数据驱动'而看不出如何识别因果效应的,不属于。" >/dev/null

bun "${SCRIPT_DIR}/_employee.ts" < "${SCRIPT_DIR}/causal-clean-hit.profile.json"
