#!/usr/bin/env bash
# 共享 seed:把行业轴(facet=industry,25 桶)+ 模式轴(facet=business_model,平台)建进测试库。
# 每个 classify case 的 seed 先调它,再 add 自己的待分类实体。
#
# 受控词表的单一事实源 = tools/seed/industry-taxonomy.json(prod 与 eval 共用统一 applier
# tools/seed/apply-industry-taxonomy.mjs)。改桶=改那份 JSON,这里不再各自维护一份,永不漂移。
# 裸跑 applier = 纯 upsert 进刚 reset 的 worker 库(DATABASE_URL 由 eval harness 注入)。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
exec bun "${PROJECT_ROOT}/tools/seed/apply-industry-taxonomy.mjs"
