#!/usr/bin/env bash
# case 13: 优然牧业(真实实体)—— 奶牛养殖/饲料/育种/草业,乳业上游农牧。
# 农牧上游在 25 桶里无对口桶 → 设计行为是不挂(不被"乳业"诱惑硬塞 consumer/manufacturing)。
# 主营清楚(非薄描述)、却哪个目标行业都不沾——这是"不命中→skip"的标准样本。期望:零 tag link。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/_industry-buckets.sh"

talent-graph entity add --type company --canonical-name "优然牧业" \
  --description "1984年创立的中国乳业上游全产业链企业，全球最大原料奶供应商，业务覆盖育种、草业、饲料、奶牛养殖，2021年港交所上市（09858.HK），运营主体为内蒙古优然牧业有限责任公司" >/dev/null
