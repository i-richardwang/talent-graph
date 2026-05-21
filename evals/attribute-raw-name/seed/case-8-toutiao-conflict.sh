#!/usr/bin/env bash
# case 8: target=字节跳动(已在 base 60);raw=今日头条 历史错挂在腾讯。
# Base 已建字节跳动 + 腾讯;case-specific 增量:
#   1) 预先建「今日头条」child entity(parent=字节跳动)— 模拟产线已建好的子主体
#   2) 把 raw "今日头条" 错挂在腾讯 entity 上(模拟历史维护错乱)
# 测点:Agent entity search 时已能看到「今日头条」child;alias add 撞
# conflict_needs_force 后应 --force 改挂到现有「今日头条」child(不是字节跳动母公司)。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

bun "${SCRIPT_DIR}/_base-companies.ts"

cd "${PROJECT_ROOT}"

BYTEDANCE=$(talent-graph entity search "字节跳动" --type company \
  | jq -r '.data.exact[] | select(.canonicalName == "字节跳动") | .entityId')
[[ -n "${BYTEDANCE}" && "${BYTEDANCE}" != "null" ]] || { echo "error: 字节跳动 entity not in base seed" >&2; exit 1; }

TENCENT=$(talent-graph entity search "腾讯" --type company \
  | jq -r '.data.exact[] | select(.canonicalName == "腾讯") | .entityId')
[[ -n "${TENCENT}" && "${TENCENT}" != "null" ]] || { echo "error: 腾讯 entity not in base seed" >&2; exit 1; }

# 预先建「今日头条」child entity 挂字节跳动 parent(seeded as existing subsidiary)。
# --force-new:跨过 similar_exists 拦截(base 60 含搜狐/新浪/搜狗等媒体类 entity,
# 向量上跟"今日头条"近 ≥0.85 阈值;此处显式确认为不同主体)。
talent-graph entity add --type company \
  --canonical-name "今日头条" \
  --description "字节跳动旗下信息流产品,独立业务边界与员工团队" \
  --parent "${BYTEDANCE}" \
  --force-new >/dev/null

# 故意错挂 raw "今日头条" 到腾讯(seeded as historical mis-attribution; 期待 Agent --force 改挂到现「今日头条」child)
talent-graph alias add --type company \
  --raw-name "今日头条" --entity "${TENCENT}" \
  --reasoning "(seeded as historical mis-attribution; expected to be force-corrected to 今日头条 child entity)" >/dev/null
