#!/usr/bin/env bash
# case 8: 樽尚(真实实体)—— 描述只有一句"商贸公司",信息不足以辨识主营。
# 期望:主营查不清 → 行业轴/模式轴都不挂,零 tag link(证据不足跳过,不硬猜)。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/_industry-buckets.sh"

talent-graph entity add --type company --canonical-name "樽尚" \
  --description "位于四川绵阳的商贸公司" >/dev/null
