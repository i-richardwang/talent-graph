#!/usr/bin/env bash
# case 2: target=字节跳动(已在 base 60);raw=ByteDance。
# 测点:字面就是英文官方名(中英对照变体)——A 路径直接 alias,
# 不需 WebSearch 也不该走 B 建子 entity。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bun "${SCRIPT_DIR}/_base-companies.ts"
