#!/usr/bin/env bash
# C16 跨切 · 部分 tag 不存在(警告继续)。蓝本复用 causal-clean-hit(美团-履约算法,causal 命中)。
# 设计:tag_list 含 causal(存在且命中)+ ghost_recall(库里不存在)。SKILL 信息源「部分 tag_list 标识
#   无对应 → 警告但继续(处理找到的)」——Agent 应对不存在的 ghost_recall 警告,但照常对 causal 判定并挂上;
#   不因一个不存在的标识就中止整个任务。(对称的「全部不存在 → 终止」是另一路径,本 case 测部分存在。)
# 预置:assertion tag「causal」+ 员工 D907312。(ghost_recall 故意不建)
# 期望:causal 被挂(confident);ghost_recall 不存在不阻断对 causal 的处理。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

talent-graph tag add --code causal --name 因果分析 --mode assertion --kind skill \
  --description "判定边界:因果分析指为估计某个干预/动作的因果效应(treatment effect / uplift),使用能排除混淆、构造反事实的方法,并把结论落地业务决策(定价/补贴/营销等)。例如用随机实验(RCT/AB)数据,或对观测数据做去偏识别——IPW、PSM、DID、工具变量、双重机器学习、uplift 建模、因果森林、S/T/X-learner、反事实建模等。只描述相关关系或趋势、做无干预语义的预测建模(分类/回归)、或笼统说'数据驱动'而看不出如何识别因果效应的,不属于。" >/dev/null

bun "${SCRIPT_DIR}/_employee.ts" < "${SCRIPT_DIR}/causal-clean-hit.profile.json"
