#!/usr/bin/env bash
# case 16: 米哈游 —— 自研自营游戏厂商(原神等)。期望:ind_gaming;不挂平台(自研自营非撮合)。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/_industry-buckets.sh"

talent-graph entity add --type company --canonical-name "米哈游" \
  --description "上海米哈游,自研自营的游戏研发与发行公司,代表作《原神》《崩坏》系列,自建团队研发并运营游戏产品。" >/dev/null
