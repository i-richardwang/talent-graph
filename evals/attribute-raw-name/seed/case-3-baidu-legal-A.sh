#!/usr/bin/env bash
# case 3: target=百度(已在 base 60);raw=北京百度网讯科技有限公司。
# 测点:百度的法律实体名——字面含"百度"但需 WebSearch 核实"网讯"是百度主体的
# 法律外壳(不是独立子业务)。A 路径直接 alias 到百度,不该走 B 建子 entity。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bun "${SCRIPT_DIR}/_base-companies.ts"
