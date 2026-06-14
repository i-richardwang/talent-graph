#!/usr/bin/env bash
# case 1: 招商银行 —— 单桶直球(method baseline)。期望:仅 ind_banking。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/_industry-buckets.sh"

talent-graph entity add --type company --canonical-name "招商银行" \
  --description "招商银行,中国领先的股份制商业银行,总部深圳,以零售银行业务见长。" >/dev/null
