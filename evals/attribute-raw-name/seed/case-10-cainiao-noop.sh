#!/usr/bin/env bash
# case 10: target=菜鸟(已建 child of 阿里);raw 已正确挂菜鸟 alias。
# 测点:周期重跑场景,Agent 应识别现状已正确,直接结束 — 不重建 entity、不 force 覆盖。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

bun "${SCRIPT_DIR}/_base-companies.ts"

cd "${PROJECT_ROOT}"

ALIBABA=$(talent-graph entity search "阿里巴巴" --type company \
  | jq -r '.data.exact[] | select(.canonicalName == "阿里巴巴") | .entityId')
[[ -n "${ALIBABA}" && "${ALIBABA}" != "null" ]] || { echo "error: 阿里巴巴 entity not in base seed" >&2; exit 1; }

CAINIAO=$(talent-graph entity add --type company \
  --canonical-name "菜鸟网络" --parent "${ALIBABA}" \
  --description "菜鸟网络 — 阿里巴巴旗下物流子集团,2023 年启动独立上市进程" \
  | jq -r '.data.entityId')
[[ -n "${CAINIAO}" && "${CAINIAO}" != "null" ]] || { echo "error: 菜鸟 entity_add failed" >&2; exit 1; }

# raw 已正确挂在菜鸟(模拟周期重跑现状已对)
talent-graph alias add --type company \
  --raw-name "浙江菜鸟供应链有限责任公司" --entity "${CAINIAO}" \
  --reasoning "(seeded as already-correct attribution; expected to noop on re-run)" >/dev/null
