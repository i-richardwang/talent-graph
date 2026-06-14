#!/usr/bin/env bash
# case 3: 德勤 —— 四大同时干审计+咨询,跨专业服务多桶。期望:accounting+consulting。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/_industry-buckets.sh"

talent-graph entity add --type company --canonical-name "德勤" \
  --description "德勤(Deloitte),全球四大会计师事务所之一,主营审计鉴证,并提供大量管理咨询、税务与财务咨询服务。" >/dev/null
