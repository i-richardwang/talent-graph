#!/usr/bin/env bash
# case 8: 纯财务持股空壳 —— 判不出就不挂(skip-not-guess)。期望:一个 ind_ 桶都不挂。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/_industry-buckets.sh"

talent-graph entity add --type company --canonical-name "瑞丰投资控股" \
  --description "瑞丰投资控股有限公司,投资控股平台,仅持有若干被投企业的财务性股权,自身不经营任何实业,无可辨识的主营业务。" >/dev/null
