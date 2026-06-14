#!/usr/bin/env bash
# case 15: 拼多多 —— 实物电商 + 撮合买卖家的平台。期望:ind_ecommerce + mdl_platform 双轴。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/_industry-buckets.sh"

talent-graph entity add --type company --canonical-name "拼多多" \
  --description "拼多多,中国主流电商平台,以社交拼团模式撮合商家与消费者交易,自身不进货自营,平台连接第三方商家。" >/dev/null
