#!/usr/bin/env bash
# 预置:tag mbb 已建,entities 表空,tag_entity_map 空。
# 测点:skill tag add 应得 already_exists 跳过,继续创建 3 个 entity + 3 个 link;
# 4 行总结 状态: already_exists,本轮动作: 挂入 3 家。
set -euo pipefail
export TALENT_GRAPH_MODE=full

talent-graph tag add \
  --code mbb --name "MBB" \
  --mode list --kind company \
  --description "MBB,顶级战略咨询 Top 3" >/dev/null
