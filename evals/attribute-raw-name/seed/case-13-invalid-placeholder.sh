#!/usr/bin/env bash
# case 13: raw="某基金管理有限公司" 是占位输入(隐去名),不指向任何真实主体。
# Base seed 已包含「（无效输入）」固定占位 entity。
# 测点:Agent 应一眼识别为占位脏数据,挂到「（无效输入）」entity 上 — F 路径,
# 不必搜索,不应建独立 entity,不应跳过(占位有专属 entity 收容)。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

bun "${SCRIPT_DIR}/_base-companies.ts"
