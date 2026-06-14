#!/usr/bin/env bash
# case 2: 中国平安 —— 综合金融集团,多桶 recall。期望:banking+insurance+asset_mgmt。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/_industry-buckets.sh"

talent-graph entity add --type company --canonical-name "中国平安" \
  --description "中国平安保险(集团)股份有限公司,综合金融集团,核心业务涵盖保险(寿险/产险)、银行、资产管理。" >/dev/null
