#!/usr/bin/env bash
# 预置:完工状态——tag ivy_league + 8 藤校 entity + 8/8 全部正确 link。
# 测点:skill 进来 tag members 拿到 8/8,识别为完工 → 本轮无任何写;
# 4 行总结 状态: already_exists,本轮动作: 无变更。
set -euo pipefail
export TALENT_GRAPH_MODE=full

talent-graph tag add \
  --code ivy_league --name "藤校" \
  --mode list --kind school \
  --description "常春藤盟校,美国东北部 8 所私立研究型大学" >/dev/null

add_and_link() {
  local name=$1 desc=$2
  local eid
  eid=$(talent-graph entity add --type school --canonical-name "$name" --description "$desc" \
    | jq -r '.data.entityId')
  talent-graph tag link --tag ivy_league --entity "$eid" \
    --reasoning "常春藤盟校 8 所之一(seed)" >/dev/null
}

add_and_link "Harvard University"          "Harvard University — 常春藤盟校,马萨诸塞州剑桥"
add_and_link "Yale University"             "Yale University — 常春藤盟校,康涅狄格州纽黑文"
add_and_link "Princeton University"        "Princeton University — 常春藤盟校,新泽西州普林斯顿"
add_and_link "Columbia University"         "Columbia University — 常春藤盟校,纽约州纽约"
add_and_link "University of Pennsylvania"  "University of Pennsylvania — 常春藤盟校,宾夕法尼亚州费城"
add_and_link "Brown University"            "Brown University — 常春藤盟校,罗得岛州普罗维登斯"
add_and_link "Dartmouth College"           "Dartmouth College — 常春藤盟校,新罕布什尔州汉诺威"
add_and_link "Cornell University"          "Cornell University — 常春藤盟校,纽约州伊萨卡"
