#!/usr/bin/env bash
# case 7: target=清华大学;DB 故意把「清华大学苏世民书院」错挂到 MIT entity。
# CSV 里同 raw 出现,触发 conflict_needs_force。
# 测点:Agent 检查 existing.entityId(MIT)与 target(清华)无层级关系,WebSearch
# 确认书院明确归清华(2016 起设立的研究生项目)→ --force 覆盖,把 alias 改挂清华。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

bun "${SCRIPT_DIR}/_base-schools.ts"

cd "${PROJECT_ROOT}"

MIT=$(talent-graph entity add --type school \
  --canonical-name "Massachusetts Institute of Technology" \
  --description "麻省理工学院 — 美国马萨诸塞州剑桥,世界顶级理工大学" \
  | jq -r '.data.entityId')

# 故意错挂——模拟历史登记错误,等本轮 task 修正
talent-graph alias add --type school \
  --raw-name "清华大学苏世民书院" --entity "${MIT}" \
  --reasoning "(seeded as historical mis-attribution; expected to be force-corrected)" >/dev/null
