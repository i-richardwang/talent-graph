#!/usr/bin/env bash
# case 12: 华通伟业(真实实体)—— 广汽本田 4S 授权经销商,亲自卖车不造车。
# 防"看公司名带本田/汽车就臆测车企"+经销≠制造。期望:不挂 ind_automotive、不挂 ind_manufacturing。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/_industry-buckets.sh"

talent-graph entity add --type company --canonical-name "华通伟业" \
  --description "北京广汽本田授权经销商，位于海淀区杏石口路，主营广汽本田品牌汽车销售与售后服务" >/dev/null
