#!/usr/bin/env bash
# case 11: 海风教育(真实实体)—— K12 在线一对一,自己请老师亲自组织教学。
# 剥离测试反向:剥掉"在线"还剩教培本业 → ind_education;"在线"只是渠道,不再补互联网。
# 期望:ind_education,且不挂 ind_internet。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/_industry-buckets.sh"

talent-graph entity add --type company --canonical-name "海风教育" \
  --description "中小学在线一对一教育品牌，2010年创立于上海，由上海风创信息咨询有限公司运营，专注K12在线个性化辅导" >/dev/null
