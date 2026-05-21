#!/usr/bin/env bash
# case 8: target=北京大学;DB 已有北大 entity(来自 base seed)+ 已挂常见 alias
#「北京大学」「Peking University」。
# 测点:CSV 里同 raw 走 already_alias 幂等;CSV 里新 raw(光华/医学部/深研院)
# 走 alias add。验证增量场景在已积累状态下的正确处理。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

bun "${SCRIPT_DIR}/_base-schools.ts"

cd "${PROJECT_ROOT}"

PKU=$(talent-graph entity search "北京大学" --type school \
  | jq -r '.data.exact[] | select(.canonicalName == "北京大学") | .entityId')
[[ -n "${PKU}" && "${PKU}" != "null" ]] || { echo "error: 北京大学 entity not found in base seed" >&2; exit 1; }

talent-graph alias add --type school --raw-name "北京大学" --entity "${PKU}" \
  --reasoning "canonical raw (seeded)" >/dev/null
talent-graph alias add --type school --raw-name "Peking University" --entity "${PKU}" \
  --reasoning "official English (seeded)" >/dev/null
