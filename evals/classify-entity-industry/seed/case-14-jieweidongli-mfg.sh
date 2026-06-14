#!/usr/bin/env bash
# case 14: 捷威动力(真实实体)—— 无名品牌,但 description 明写动力电池"研发/制造/销售"。
# 测从脏自述里正确抽出 ind_manufacturing(动力电池=汽车零部件,归制造非整车)。
# 期望:ind_manufacturing,且不挂 ind_automotive(零部件≠整车)。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/_industry-buckets.sh"

talent-graph entity add --type company --canonical-name "捷威动力" \
  --description "2009年创立于天津的新能源动力电池企业，品牌JEVE，专注锂离子动力电池研发、制造及销售，建有天津、盐城、嘉兴等多个生产基地" >/dev/null
