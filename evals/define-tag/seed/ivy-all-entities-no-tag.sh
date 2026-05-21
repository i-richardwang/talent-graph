#!/usr/bin/env bash
# 预置:8 所藤校 + 2 干扰项(MIT / Stanford)已注册到 entities;tags 表无 ivy_league;
# tag_entity_map 空。
# 测点:skill 应通过 entity search 命中 exact 复用 8 所,不重复 add;干扰项不挂。
set -euo pipefail
export TALENT_GRAPH_MODE=full

add_entity() {
  talent-graph entity add --type "$1" --canonical-name "$2" --description "$3" >/dev/null
}

add_entity school "Harvard University"                   "Harvard University — 常春藤盟校,马萨诸塞州剑桥"
add_entity school "Yale University"                      "Yale University — 常春藤盟校,康涅狄格州纽黑文"
add_entity school "Princeton University"                 "Princeton University — 常春藤盟校,新泽西州普林斯顿"
add_entity school "Columbia University"                  "Columbia University — 常春藤盟校,纽约州纽约"
add_entity school "University of Pennsylvania"           "University of Pennsylvania — 常春藤盟校,宾夕法尼亚州费城"
add_entity school "Brown University"                     "Brown University — 常春藤盟校,罗得岛州普罗维登斯"
add_entity school "Dartmouth College"                    "Dartmouth College — 常春藤盟校,新罕布什尔州汉诺威"
add_entity school "Cornell University"                   "Cornell University — 常春藤盟校,纽约州伊萨卡"
add_entity school "Massachusetts Institute of Technology" "Massachusetts Institute of Technology — 顶尖私立研究型大学,马萨诸塞州剑桥"
add_entity school "Stanford University"                  "Stanford University — 顶尖私立研究型大学,加州斯坦福"
