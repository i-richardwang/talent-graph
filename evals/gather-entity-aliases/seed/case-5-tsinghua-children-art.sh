#!/usr/bin/env bash
# case 5: target=清华大学;DB 已有 child「清华大学美术学院」+ 美院 alias 已挂。
# 测点:CSV 里美院相关 raw 触发 conflict_needs_force,Agent 检查 existing
# 的 parentId 指 target → 跳过 force(已挂在子 entity,不要往母覆盖)。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

bun "${SCRIPT_DIR}/_base-schools.ts"

cd "${PROJECT_ROOT}"

PARENT=$(talent-graph entity search "清华大学" --type school \
  | jq -r '.data.exact[] | select(.canonicalName == "清华大学") | .entityId')
[[ -n "${PARENT}" && "${PARENT}" != "null" ]] || { echo "error: 清华大学 entity not found in base seed" >&2; exit 1; }

CHILD=$(talent-graph entity add --type school \
  --canonical-name "清华大学美术学院" --parent "${PARENT}" \
  --description "清华大学美术学院 — 清华下属学院,前身中央工艺美术学院,1999 年并入清华" \
  | jq -r '.data.entityId')

talent-graph alias add --type school \
  --raw-name "清华大学美术学院" --entity "${CHILD}" \
  --reasoning "child entity canonical raw (seeded)" >/dev/null
