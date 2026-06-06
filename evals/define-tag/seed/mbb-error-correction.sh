#!/usr/bin/env bash
# 预置:tag mbb 已建,entities 表有 McKinsey/BCG/Bain/Deloitte 4 个,
# tag_entity_map 有 4 个错误 link(三家 MBB 都对,Deloitte 错挂)。
# 测点:skill 通过 tag members 看到 4 个挂载,WebSearch 核实正确清单是 3 家,
# 本轮动作 = 解绑 Deloitte 1 家;不重复创建实体、不重复 link 已正确的 3 家。
set -euo pipefail
export TALENT_GRAPH_MODE=full

talent-graph tag add \
  --code mbb --name "MBB" \
  --mode list --kind company \
  --description "MBB,顶级战略咨询 Top 3" >/dev/null

# seed 握有 ground truth,下列是各自独立的实体:用 --force-new 断言新建,
# 不被 entity add 的相似度防呆(similar_exists)拦下——那个防呆是给拿不准的 Agent 用的。
add_and_link() {
  local name=$1 desc=$2
  local eid
  eid=$(talent-graph entity add --type company --canonical-name "$name" --description "$desc" --force-new \
    | jq -r '.data.entityId')
  talent-graph tag link --tag mbb --entity "$eid" --match-mode subtree \
    --reasoning "顶级战略咨询 Top 3(seed)" >/dev/null
}

add_and_link "McKinsey & Company"        "McKinsey & Company — 顶级战略咨询 Top 3,全球"
add_and_link "Boston Consulting Group"   "Boston Consulting Group — 顶级战略咨询 Top 3,全球"
add_and_link "Bain & Company"            "Bain & Company — 顶级战略咨询 Top 3,全球"
add_and_link "Deloitte"                  "Deloitte — 四大会计师事务所之一,全球"
