#!/usr/bin/env bash
# case 6: target=清华大学;DB 已有 child「清华大学医学部」+ alias「清华大学医学部
# (北京协和医学院)」已挂医学部子 entity。CSV 里同 raw 出现,触发 conflict_needs_force。
# 测点:Agent 检查 existing.entityId 是医学部,其 parentId 指 target → 跳过 force
# (已正确挂在子 entity,不该往母覆盖)。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

bun "${SCRIPT_DIR}/_base-schools.ts"

cd "${PROJECT_ROOT}"

PARENT=$(talent-graph entity search "清华大学" --type school \
  | jq -r '.data.exact[] | select(.canonicalName == "清华大学") | .entityId')
[[ -n "${PARENT}" && "${PARENT}" != "null" ]] || { echo "error: 清华大学 entity not found in base seed" >&2; exit 1; }

CHILD=$(talent-graph entity add --type school \
  --canonical-name "清华大学医学部" --parent "${PARENT}" \
  --description "清华大学医学部 — 与北京协和医学院联合体制,2006 年起" \
  | jq -r '.data.entityId')

talent-graph alias add --type school \
  --raw-name "清华大学医学部(北京协和医学院)" --entity "${CHILD}" \
  --reasoning "医学部 canonical raw with 协和 注释 (seeded)" >/dev/null
