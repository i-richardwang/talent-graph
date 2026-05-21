#!/usr/bin/env bash
# case 15: raw="今日資本(香港)有限公司" 是今日资本集团(Capital Today)的香港主体,
# 今日资本本身是顶层独立 VC 集团(徐新创立,管 25 亿美元基金,投了京东 / 美团 /
# 字节跳动 / 月之暗面等),与 base 60 任何家无母子关系。
# 测点:Agent 应建一层独立 entity 「今日资本」无 parent,raw 挂上去。
# 不应跳过——新设计下 base 找不到祖先 = 建独立主体,不再跳过。
# 这是用户原始痛点 case 的回归测试:验证知名独立顶层主体不被旧"业务关心范围跳过"
# 的认知遗留误判。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bun "${SCRIPT_DIR}/_base-companies.ts"
