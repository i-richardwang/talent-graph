#!/usr/bin/env bash
# case 4: target=蚂蚁集团;raw=支付宝（中国）网络技术有限公司 历史错挂在阿里巴巴。
# Base 已建阿里巴巴(母公司,base 60 一员);case-specific 增量:
#   1. 补建蚂蚁集团 entity(独立子集团,模拟项目刚意识到要拆但历史 alias 还没迁)
#   2. 把 raw 错挂在阿里 entity 上(模拟历史维护尚未迁的状态)
# 测点:Agent 应 entity get 看到 existing 是阿里、外部核实蚂蚁是阿里 1+6+N 拆分独立子集团、
# 然后 alias add --force 改挂蚂蚁 entity。
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
  --description "蚂蚁集团 — 阿里巴巴 1+6+N 拆分独立子集团,核心产品支付宝,2020 年 A+H 双重上市暂缓后仍属拟拆分主体" \
  | jq -r '.data.entityId')
[[ -n "${ANTGROUP}" && "${ANTGROUP}" != "null" ]] || { echo "error: 蚂蚁集团 entity_add failed" >&2; exit 1; }

# 故意错挂 raw 在阿里(seeded as historical mis-attribution; 期待本轮 Agent --force 改挂蚂蚁)
talent-graph alias add --type company \
  --raw-name "支付宝（中国）网络技术有限公司" --entity "${ALIBABA}" \
  --reasoning "(seeded as historical mis-attribution; expected to be force-corrected to 蚂蚁集团)" >/dev/null
