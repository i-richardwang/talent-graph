#!/usr/bin/env bash
# C15 跨切 · employee_not_found。设计:tag 存在,但触发的目标 emp_id(D628451)不 seed、库里不存在。
#   SKILL 信息源「employee get → employee_not_found → 跳过整个任务,正常退出并报告」——Agent 应识别
#   员工不存在、优雅退出报告,而非误写、报错崩溃或凭空臆造 profile。
# 预置:assertion tag「causal」;故意不 seed 任何员工。
# 期望:处理过程中不存在把 D628451 挂到任何标签的 tag-add 命令调用。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

talent-graph tag add --code causal --name 因果分析 --mode assertion --kind skill \
  --description "判定边界:因果分析指为估计某个干预/动作的因果效应(treatment effect / uplift),使用能排除混淆、构造反事实的方法,并把结论落地业务决策(定价/补贴/营销等)。例如用随机实验(RCT/AB)数据,或对观测数据做去偏识别——IPW、PSM、DID、工具变量、双重机器学习、uplift 建模、因果森林、S/T/X-learner、反事实建模等。只描述相关关系或趋势、做无干预语义的预测建模(分类/回归)、或笼统说'数据驱动'而看不出如何识别因果效应的,不属于。" >/dev/null

# 故意不 seed 员工:触发 employee_not_found 路径
