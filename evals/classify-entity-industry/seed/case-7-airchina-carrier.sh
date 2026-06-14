#!/usr/bin/env bash
# case 7: 中国国际航空 —— 客运承运商,直验 logistics/transportation 修复。期望:ind_transportation,
# 不挂 ind_logistics(客运不是货运)。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/_industry-buckets.sh"

talent-graph entity add --type company --canonical-name "中国国际航空" \
  --description "中国国际航空股份有限公司,中国载旗航空公司,主营国内及国际旅客航空运输。" >/dev/null
