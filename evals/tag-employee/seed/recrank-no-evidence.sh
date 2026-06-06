#!/usr/bin/env bash
# C5 推荐排序 · 证据不足(不属于)。蓝本(阿里飞猪-测试开发专家)。
# 脱敏:仅换姓名(李梦琪)+ emp_id(D518364,逼真同格式);公司(阿里/飞猪/百度)、work_list 全 verbatim。
# 证据(work_list):本人是「飞猪算法测试负责人,建立飞猪推荐算法质量保障方案」「算法测试效能工具平台:飞轮」
#   —— 给推荐算法做测试/QA/质量保障,本人没做召回/排序/CTR 模型环节。典型"在推荐方向但没做模型本身"。
# 预置:assertion tag「recrank」+ 员工 D518364。
# 期望:/tag-employee 判证据不足,不写(无 recrank tag-add)。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

talent-graph tag add --code recrank --name 推荐排序 --mode assertion --kind skill \
  --description "判定边界:推荐排序指亲手构建或调优过推荐/搜索系统中'从海量候选里选出并排序'的模型环节,例如召回(协同过滤、向量、多路)、粗排/精排/重排、CTR/CVR 预估建模、相关特征工程与在线 serving 等。只是在'推荐团队/推荐方向'任职、或把'商品推荐/搭配推荐'当业务分析话题谈及而看不出本人做过模型环节的,不属于。" >/dev/null

bun "${SCRIPT_DIR}/_employee.ts" < "${SCRIPT_DIR}/recrank-no-evidence.profile.json"
