#!/usr/bin/env bash
# case 6: 滴滴出行 —— 平台 vs 运营商边界。出行平台自己不承运 → 期望 ind_internet,不挂 transportation。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/_industry-buckets.sh"

talent-graph entity add --type company --canonical-name "滴滴出行" \
  --description "滴滴出行,移动出行平台,通过 App 撮合网约车、出租车、顺风车等出行服务,自身不拥有车队承运。" >/dev/null
