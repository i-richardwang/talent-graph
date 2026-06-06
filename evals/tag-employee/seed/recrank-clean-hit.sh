#!/usr/bin/env bash
# C4 推荐排序 · clean-hit。蓝本(美团-feed 流推荐全链路算法)。
# 脱敏:仅换姓名(王伟杰)+ emp_id(D742508,与真实同格式、逼真);公司(美团/58赶集)、
#   work_list 全 verbatim,字数不压缩。
# 证据(work_list):美团点评「首页 feed 流推荐召回、粗排、精排、多目标融合全链路模型算法优化」,
#   自研粗排 DNN 框架、精排 DCN/deepfm/mmoe、多目标融合 —— 召回/排序模型环节亲手实操,干净命中。
# 预置:assertion tag「recrank」(推荐排序, kind=skill)+ 员工 D742508。
# 期望:/tag-employee 判 confident 命中(tag-add --confidence confident)。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

talent-graph tag add --code recrank --name 推荐排序 --mode assertion --kind skill \
  --description "判定边界:推荐排序指亲手构建或调优过推荐/搜索系统中'从海量候选里选出并排序'的模型环节,例如召回(协同过滤、向量、多路)、粗排/精排/重排、CTR/CVR 预估建模、相关特征工程与在线 serving 等。只是在'推荐团队/推荐方向'任职、或把'商品推荐/搭配推荐'当业务分析话题谈及而看不出本人做过模型环节的,不属于。" >/dev/null

bun "${SCRIPT_DIR}/_employee.ts" < "${SCRIPT_DIR}/recrank-clean-hit.profile.json"
