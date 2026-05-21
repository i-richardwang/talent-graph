#!/usr/bin/env bash
# case 6: raw=紫光展锐——母公司是紫光集团,但紫光集团不在 base 60。
# 测点:Agent WebSearch 后知道母公司紫光集团是跨多业务的业务集团母公司,
# 按 SKILL "base 找不到祖先 + 上面有业务集团母公司 → 建两层" 沿股权链建
# 紫光集团(顶层,无 parent) + 紫光展锐(parent=紫光集团),raw 挂在紫光展锐。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bun "${SCRIPT_DIR}/_base-companies.ts"
