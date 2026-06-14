#!/usr/bin/env bash
# case 10: 京医通(真实实体)—— 互联网医疗服务平台(在线预约挂号),撮合医患、自己不行医。
# 期望:服务医疗领域 → ind_healthcare;撮合不下场 → mdl_platform。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/_industry-buckets.sh"

talent-graph entity add --type company --canonical-name "京医通" \
  --description "北京市互联网医疗服务平台，2014年成立于北京，运营京医通线上预约挂号系统，运营主体为北京怡合春天科技有限公司" >/dev/null
