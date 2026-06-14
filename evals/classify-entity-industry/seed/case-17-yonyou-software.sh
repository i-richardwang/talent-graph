#!/usr/bin/env bash
# case 17: 用友 —— 自营卖 ERP/企业软件/SaaS 的厂商。期望:ind_software;不挂平台(卖软件非撮合供需)。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/_industry-buckets.sh"

talent-graph entity add --type company --canonical-name "用友网络" \
  --description "用友网络科技,中国领先的企业管理软件与云服务(ERP/财务/SaaS)厂商,自研自销面向企业的管理软件与云产品。" >/dev/null
