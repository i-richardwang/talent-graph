#!/usr/bin/env bash
# case 2: 中国平安 —— 综合金融集团,判主营单桶。期望:主营=保险(ind_insurance);
#         不因集团涉银行/资管就多挂(那些板块由子实体平安银行/平安资管扛,下游末级优先聚合)。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/_industry-buckets.sh"

talent-graph entity add --type company --canonical-name "中国平安" \
  --description "中国平安保险(集团)股份有限公司,以保险为主业的综合金融集团——寿险/产险是集团营收与利润的主体,另设平安银行、平安资管等金融板块。" >/dev/null
