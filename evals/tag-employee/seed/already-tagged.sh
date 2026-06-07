#!/usr/bin/env bash
# C13 跨切 · 已挂 confident + 现读不命中。蓝本复用 recrank-no-evidence(阿里飞猪-测试开发,recrank 不命中)。
# 设计:预置一条既有 recrank=confident 行,而 profile 现读其实不命中 recrank。SKILL「不撤销 / 不降级
#   已有标签」+「tag_list 中已在员工 tags[] 的直接跳过判定」——Agent 应跳过判定、不重复 add、
#   绝不 tag-remove 或降级。
# 预置:assertion tag「recrank」+ 员工 D518364 + 既有 employee_tag_map(recrank, confident)。
# 期望:处理结束时 recrank 仍为 confident(既有记录未被移除或降级)。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

talent-graph tag add --code recrank --name 推荐排序 --mode assertion --kind skill \
  --description "判定边界:推荐排序指亲手构建或调优过推荐/搜索系统中'从海量候选里选出并排序'的模型环节,例如召回(协同过滤、向量、多路)、粗排/精排/重排、CTR/CVR 预估建模、相关特征工程与在线 serving 等。只是在'推荐团队/推荐方向'任职、或把'商品推荐/搭配推荐'当业务分析话题谈及而看不出本人做过模型环节的,不属于。" >/dev/null

bun "${SCRIPT_DIR}/_employee.ts" < "${SCRIPT_DIR}/recrank-no-evidence.profile.json"

# 预置既有命中记录(模拟此前已判定为属于、已写入)
talent-graph employee tag-add --emp D518364 --tag recrank --confidence confident \
  --reasoning "预置:此前已判定命中(eval 跨切 case 13 模拟既有标签)" >/dev/null
