#!/usr/bin/env bash
# case 9: 大账房(真实实体)—— 财税 SaaS,自营卖软件(非撮合)。描述含"生态平台"措辞陷阱。
# 期望:财税无对口桶 → 落 ind_software;自营卖软件、非撮合 → 不挂 mdl_platform。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/_industry-buckets.sh"

talent-graph entity add --type company --canonical-name "大账房" \
  --description "2014年成立的财税SaaS服务企业，国家高新技术企业，主打智能财税、人资服务等一站式生态平台" >/dev/null
