#!/usr/bin/env bash
# 预置:tag ivy_league 已建,8 藤校全注册,tag_entity_map 已挂前 4 所
# (Harvard / Yale / Princeton / Columbia)。后 4 所未挂。
# 测点:skill 通过 tag members 看到 4 已挂,本轮增量只 link 后 4 所;
# 不重复 add 实体,不动既有 tag 元数据。
set -euo pipefail
export TALENT_GRAPH_MODE=full

talent-graph tag add \
  --code ivy_league --name "藤校" \
  --mode list --kind school \
  --description "常春藤盟校,美国东北部 8 所私立研究型大学" >/dev/null

add_entity_id() {
  talent-graph entity add --type "$1" --canonical-name "$2" --description "$3" \
    | jq -r '.data.entityId'
}

HARV=$(add_entity_id school "Harvard University"          "Harvard University — 常春藤盟校,马萨诸塞州剑桥")
YALE=$(add_entity_id school "Yale University"             "Yale University — 常春藤盟校,康涅狄格州纽黑文")
PRIN=$(add_entity_id school "Princeton University"        "Princeton University — 常春藤盟校,新泽西州普林斯顿")
COLU=$(add_entity_id school "Columbia University"         "Columbia University — 常春藤盟校,纽约州纽约")
add_entity_id     school "University of Pennsylvania"  "University of Pennsylvania — 常春藤盟校,宾夕法尼亚州费城" >/dev/null
add_entity_id     school "Brown University"            "Brown University — 常春藤盟校,罗得岛州普罗维登斯" >/dev/null
add_entity_id     school "Dartmouth College"           "Dartmouth College — 常春藤盟校,新罕布什尔州汉诺威" >/dev/null
add_entity_id     school "Cornell University"          "Cornell University — 常春藤盟校,纽约州伊萨卡" >/dev/null

for eid in "$HARV" "$YALE" "$PRIN" "$COLU"; do
  talent-graph tag link --tag ivy_league --entity "$eid" \
    --reasoning "常春藤盟校 8 所之一(seed)" >/dev/null
done
