#!/usr/bin/env bash
# case 4: 菜鸟(parent=阿里巴巴)—— 子母独立判 + exact。
# 任务只判菜鸟:期望 ind_logistics --match-mode exact 挂在菜鸟,不蹭阿里(阿里的桶不连带落到菜鸟)。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/_industry-buckets.sh"

ALI=$(talent-graph entity add --type company --canonical-name "阿里巴巴集团" \
  --description "阿里巴巴集团,中国电子商务与互联网科技公司,核心为电商平台与云计算。" \
  | jq -r '.data.entityId')
[[ -n "${ALI}" && "${ALI}" != "null" ]] || { echo "error: 阿里巴巴集团 entity add 未返回 entityId" >&2; exit 1; }

talent-graph entity add --type company --canonical-name "菜鸟网络" \
  --description "菜鸟,阿里巴巴集团旗下智慧物流网络,主营仓储、快递协同与供应链物流服务。" \
  --parent "${ALI}" >/dev/null
