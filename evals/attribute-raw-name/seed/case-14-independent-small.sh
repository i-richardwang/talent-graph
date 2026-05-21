#!/usr/bin/env bash
# case 14: raw="上海钢联电子商务股份有限公司" 是真实独立公司(B2B 钢铁电商,A 股上市),
# 行业垂直小众公司,自身就是顶层,与 base 60 任何家无母子关系。
# 测点:Agent 应建一层独立 entity 无 parent,关键不能误挂(防字面"上海"碰瓷),
# 不能挂占位 entity(raw 是真实有归属的小众公司),不能建子主体挂任何 parent,
# 不能跳过(新设计下 base 找不到祖先 = 建独立主体,不再跳过)。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

bun "${SCRIPT_DIR}/_base-companies.ts"
