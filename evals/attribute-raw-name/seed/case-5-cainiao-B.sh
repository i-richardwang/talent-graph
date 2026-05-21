#!/usr/bin/env bash
# case 5: target=阿里巴巴(已在 base 60);raw=浙江菜鸟供应链有限责任公司,菜鸟未建。
# 测点:Agent 应判 B 类——先 entity add 注册菜鸟 child 挂阿里 parent_id,
# 再 alias add 把 raw 挂菜鸟新 entity(不是阿里 entity)。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bun "${SCRIPT_DIR}/_base-companies.ts"
