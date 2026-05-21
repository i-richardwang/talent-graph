#!/usr/bin/env bash
# case 11: target=蚂蚁集团(已建 child of 阿里);raw 已正确挂蚂蚁。
# 测点:现状已是更精细的 child entity,Agent 不应改回粗 entity(阿里) — 即使
# Agent 一开始判 A(阿里)也应在看到现状已是 target 的 child 后跳过,不 force 覆盖。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

bun "${SCRIPT_DIR}/_base-companies.ts"

cd "${PROJECT_ROOT}"

ALIBABA=$(talent-graph entity search "阿里巴巴" --type company \
  | jq -r '.data.exact[] | select(.canonicalName == "阿里巴巴") | .entityId')
[[ -n "${ALIBABA}" && "${ALIBABA}" != "null" ]] || { echo "error: 阿里巴巴 entity not in base seed" >&2; exit 1; }

ANTGROUP=$(talent-graph entity add --type company \
  --canonical-name "蚂蚁集团" --parent "${ALIBABA}" \
  --description "蚂蚁集团 — 阿里巴巴 1+6+N 拆分独立子集团,核心产品支付宝" \
  | jq -r '.data.entityId')
[[ -n "${ANTGROUP}" && "${ANTGROUP}" != "null" ]] || { echo "error: 蚂蚁集团 entity_add failed" >&2; exit 1; }

# raw 已正确挂蚂蚁(更精细 child),模拟现状已是 finer-precision
talent-graph alias add --type company \
  --raw-name "支付宝（中国）网络技术有限公司" --entity "${ANTGROUP}" \
  --reasoning "(seeded as finer-precision attribution; expected to be kept on re-run)" >/dev/null
