#!/usr/bin/env bash
# case 13: 赛派展览(真实实体)—— 会展/展台设计搭建/会议活动服务。
# 会展在 22 桶里无对口桶 → 设计行为是不挂(不硬塞 media/consulting)。期望:零 tag link。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/_industry-buckets.sh"

talent-graph entity add --type company --canonical-name "赛派展览" \
  --description "上海展览展示服务公司，主营展台设计与搭建、品牌形象专柜和店中店设计与装修、企业形象策划及会议活动服务" >/dev/null
