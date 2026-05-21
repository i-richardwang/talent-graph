#!/usr/bin/env bash
# case 1: target=字节跳动(已在 base 60);raw=字节跳动(上海)。
# 测点:字面就是"主体名 + 地理后缀"——A 路径直接 alias,
# 不需 WebSearch 也不该走 B 建子 entity。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bun "${SCRIPT_DIR}/_base-companies.ts"
