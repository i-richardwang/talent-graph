#!/usr/bin/env bash
# Per-run reset script for better-skills evals。
# better-skills 在每个 run-K/ 启动前调一次本脚本,cwd=run dir,env 含 per_run_setup
# 注入的 DATABASE_URL(指向某个 worker DB)。本脚本切到项目根目录调 bun 转发,
# 然后按 case.env 注入的 SEED_PROFILE dispatch 到 ./seed/<profile>.sh 预置数据。
# SEED_PROFILE 不设 → 仅 reset(纯空 DB,目前无 case 用此路径)。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${PROJECT_ROOT}"
bun tools/test/reset-worker-db.ts

if [[ -n "${SEED_PROFILE:-}" ]]; then
  SEED_SCRIPT="${SCRIPT_DIR}/seed/${SEED_PROFILE}.sh"
  if [[ ! -x "${SEED_SCRIPT}" ]]; then
    echo "error: seed script not found or not executable: ${SEED_SCRIPT}" >&2
    exit 1
  fi
  exec "${SEED_SCRIPT}"
fi
