#!/usr/bin/env bash
# C6 推荐排序 · 边界模糊。蓝本(氦图科技-推荐系统工程师)。
# 脱敏:仅换姓名(张哲瀚)+ emp_id(D639172,逼真同格式);公司(蚂蚁/氦图/云从)、work_list 全 verbatim。
# 证据(work_list):岗位「推荐系统工程师」+「基于 lucene+faiss 的带文本过滤的向量召回系统(ANN/HNSW/PQ
#   乘积量化, C++/JNI)」—— 做了召回(description 列的组件),但它是检索工程实现,而非推荐系统的召回
#   模型建模/调优;算不算"推荐排序"卡在 description 没划清的"召回工程 vs 召回模型环节"那条线上。
# 预置:assertion tag「recrank」+ 员工 D639172。
# 期望(边界范式,同 C3):不可 confident——要么不写,要么写 borderline。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

talent-graph tag add --code recrank --name 推荐排序 --mode assertion --kind skill \
  --description "判定边界:推荐排序指亲手构建或调优过推荐/搜索系统中'从海量候选里选出并排序'的模型环节,例如召回(协同过滤、向量、多路)、粗排/精排/重排、CTR/CVR 预估建模、相关特征工程与在线 serving 等。只是在'推荐团队/推荐方向'任职、或把'商品推荐/搭配推荐'当业务分析话题谈及而看不出本人做过模型环节的,不属于。" >/dev/null

bun "${SCRIPT_DIR}/_employee.ts" < "${SCRIPT_DIR}/recrank-boundary.profile.json"
