#!/usr/bin/env bash
# case 10: target=Imperial College London;DB 已有 Imperial entity + 已挂带地理前缀的
#「近似」写法「伦敦帝国理工学院」「伦敦帝国理工大学」「伦敦帝国理工」。
# 测点:CSV 里的「裸」写法「帝国理工学院」「帝国理工大学」「帝国理工」与已挂近似写法
#   字面不同、库中尚无 —— Agent 须各自 alias add,不得因"近似写法已存在"误判跳过。
# 复刻正式库 batch 1f719d:Agent 把已挂的「伦敦帝国理工学院」模式匹配成裸「帝国理工学院」
#   也已覆盖,静默漏登 60 人在用的写法。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

bun "${SCRIPT_DIR}/_base-schools.ts"

cd "${PROJECT_ROOT}"

talent-graph entity add --canonical-name "Imperial College London" --type school \
  --description "Imperial College London — 2025 QS世界大学排名前100,伦敦" >/dev/null

IMP=$(talent-graph entity search "Imperial College London" --type school \
  | jq -r '.data.exact[] | select(.canonicalName == "Imperial College London") | .entityId')
[[ -n "${IMP}" && "${IMP}" != "null" ]] || { echo "error: Imperial College London entity not found after add" >&2; exit 1; }

talent-graph alias add --type school --raw-name "伦敦帝国理工学院" --entity "${IMP}" \
  --reasoning "geographic-prefixed form (seeded decoy)" >/dev/null
talent-graph alias add --type school --raw-name "伦敦帝国理工大学" --entity "${IMP}" \
  --reasoning "geographic-prefixed form (seeded decoy)" >/dev/null
talent-graph alias add --type school --raw-name "伦敦帝国理工" --entity "${IMP}" \
  --reasoning "geographic-prefixed form (seeded decoy)" >/dev/null
