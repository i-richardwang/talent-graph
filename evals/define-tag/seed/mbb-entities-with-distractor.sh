#!/usr/bin/env bash
# 预置:entities 表有 McKinsey/BCG/Bain/Deloitte 4 个;tags 表无 mbb;tag_entity_map 空。
# 测点:skill 通过 entity search 命中 exact 复用全部 4 个不重复 add;
# 只把 3 家 MBB link 到 mbb tag,不链 Deloitte;3 个 link 都是 subtree。
set -euo pipefail
export TALENT_GRAPH_MODE=full

# seed 握有 ground truth,下列是各自独立的实体:用 --force-new 断言新建,
# 不被 entity add 的相似度防呆(similar_exists)拦下——那个防呆是给拿不准的 Agent 用的。
add_entity() {
  talent-graph entity add --type "$1" --canonical-name "$2" --description "$3" --force-new >/dev/null
}

add_entity company "McKinsey & Company"      "McKinsey & Company — 顶级战略咨询 Top 3,全球"
add_entity company "Boston Consulting Group" "Boston Consulting Group — 顶级战略咨询 Top 3,全球"
add_entity company "Bain & Company"          "Bain & Company — 顶级战略咨询 Top 3,全球"
add_entity company "Deloitte"                "Deloitte — 四大会计师事务所之一,全球"
