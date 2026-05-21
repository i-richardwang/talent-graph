#!/usr/bin/env bash
# case 7: target=阿里巴巴(已在 base 60);raw=LAZADA。
# 测点:LAZADA 是阿里 2016 全资收购的东南亚电商,从未独立 IPO 拆分上市,
# 不符合 prompt B 类硬标准。Agent 应判 A——直接 alias 到阿里,
# 不该错走 B 建 LAZADA child entity。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bun "${SCRIPT_DIR}/_base-companies.ts"
