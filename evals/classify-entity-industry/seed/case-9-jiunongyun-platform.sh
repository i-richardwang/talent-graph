#!/usr/bin/env bash
# case 9: 久农云(真实实体)—— 农产品流通"数字化平台",自己不种地不送货。
# 剥离测试:剥掉平台层不剩本业 → ind_internet。期望:仅 ind_internet,不挂物流、不当农业跳过。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/_industry-buckets.sh"

talent-graph entity add --type company --canonical-name "久农云" \
  --description "2022年成立于北京的农产品流通产业数字化服务商，品牌久农云，核心产品包括智慧农批平台、智能防疫平台、农产品流通大数据平台等，运营主体为北京久农科技有限公司" >/dev/null
