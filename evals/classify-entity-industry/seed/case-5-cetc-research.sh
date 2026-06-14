#!/usr/bin/env bash
# case 5: 中国电科第十四研究所 —— 军工/国防科研院所归并规则。期望:ind_education(科研),
# 不挂 manufacturing、不跳过。验 prompt「军工科研院所→education」这条 domain 规则被吃到。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/_industry-buckets.sh"

talent-graph entity add --type company --canonical-name "中国电子科技集团第十四研究所" \
  --description "中国电子科技集团公司第十四研究所(南京),从事雷达与电子信息系统的科研院所。" >/dev/null
