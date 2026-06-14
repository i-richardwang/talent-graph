#!/usr/bin/env bash
# case 11: 学而思网校(真实实体)—— 在线教育,自营直播教学(自己组织师资授课,非撮合)。
# 期望:ind_education;"在线"只是授课渠道,自营教学 → 不挂 mdl_platform。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/_industry-buckets.sh"

talent-graph entity add --type company --canonical-name "学而思网校" \
  --description "学而思旗下中小学在线教育品牌，提供6-18岁学生全学科在线直播辅导及2-8岁启蒙课程" >/dev/null
