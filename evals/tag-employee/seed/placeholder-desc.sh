#!/usr/bin/env bash
# C14 跨切 · 占位 description(TODO) + 一个正常命中。蓝本复用 causal-clean-hit(美团-履约算法,causal 命中)。
# 设计:causal 正常 description(profile 命中);tbd_skill 的 description 是占位「TODO」,无法据以判定。
#   SKILL「占位 description(TODO 或几字占位)跳过该 tag(不写)并向调用方报告」——Agent 应跳过
#   tbd_skill、照常挂 causal。
# 预置:assertion tag「causal」(正常)+「tbd_skill」(description=TODO)+ 员工 D907312。
# 期望:causal 被挂(confident);tbd_skill 不被挂。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

talent-graph tag add --code causal --name 因果分析 --mode assertion --kind skill \
  --description "判定边界:因果分析指为估计某个干预/动作的因果效应(treatment effect / uplift),使用能排除混淆、构造反事实的方法,并把结论落地业务决策(定价/补贴/营销等)。例如用随机实验(RCT/AB)数据,或对观测数据做去偏识别——IPW、PSM、DID、工具变量、双重机器学习、uplift 建模、因果森林、S/T/X-learner、反事实建模等。只描述相关关系或趋势、做无干预语义的预测建模(分类/回归)、或笼统说'数据驱动'而看不出如何识别因果效应的,不属于。" >/dev/null

talent-graph tag add --code tbd_skill --name 待定技能 --mode assertion --kind skill \
  --description "TODO" >/dev/null

bun "${SCRIPT_DIR}/_employee.ts" < "${SCRIPT_DIR}/causal-clean-hit.profile.json"
