#!/usr/bin/env bash
# case 10: 冬日中医(真实实体)—— 互联网中医"在线问诊平台",撮合医生、自己不行医。
# 剥离测试:剥掉平台层不剩本业 → ind_internet。期望:ind_internet,不挂医药/医疗。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/_industry-buckets.sh"

talent-graph entity add --type company --canonical-name "冬日中医" \
  --description "2015年创立于厦门的互联网中医服务平台，专注中医在线问诊与养生资讯，运营主体为厦门冬日暖阳网络科技有限公司" >/dev/null
