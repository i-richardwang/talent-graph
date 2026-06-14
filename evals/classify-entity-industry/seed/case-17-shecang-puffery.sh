#!/usr/bin/env bash
# case 17: 舍藏(真实实体)—— 义乌贸易公司,在 1688 等批发"平台"上卖自家家居用品。
# 注水识破:描述含"平台"二字,但它是平台上的卖家、不是平台方。
# 期望:实物线上卖货 → ind_ecommerce 或 ind_consumer 其一;在别人平台上卖货 → 不挂 mdl_platform。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/_industry-buckets.sh"

talent-graph entity add --type company --canonical-name "舍藏" \
  --description "义乌市贸易公司，主营收纳袋、家居用品等，运营于1688等批发平台" >/dev/null
