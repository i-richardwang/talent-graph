#!/usr/bin/env bash
# case 14: 科易动力(真实实体)—— 新能源动力电池系统研发制造(零部件/系统,非整车)。
# 期望:动力电池研发制造归 ind_manufacturing;零部件不当 ind_automotive(整车才是车企)。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/_industry-buckets.sh"

talent-graph entity add --type company --canonical-name "科易动力" \
  --description "2010年创立于北京，专注新能源动力电池系统的高新技术企业，品牌KeyPower" >/dev/null
