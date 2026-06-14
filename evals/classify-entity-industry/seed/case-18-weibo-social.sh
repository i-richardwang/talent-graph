#!/usr/bin/env bash
# case 18: 微博 —— 社交媒体/UGC 社区平台。期望:ind_social + mdl_platform 双轴。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/_industry-buckets.sh"

talent-graph entity add --type company --canonical-name "新浪微博" \
  --description "新浪微博,中国主流社交媒体与 UGC 社区平台,用户发布与互动内容,平台连接创作者、用户与广告主。" >/dev/null
