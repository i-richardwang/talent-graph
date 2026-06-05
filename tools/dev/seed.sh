#!/usr/bin/env bash
# 种子数据:藤校 + MBB + 清华大学
# 全部通过 CLI 写入,演示正常使用路径
#
# 用法: bash tools/dev/seed.sh
# 前提: .env.local 已配好 DATABASE_URL;docker compose up -d 已起来;bun run db:migrate 已跑过
#
# 依赖: jq (用于解析 envelope JSON 输出)

set -euo pipefail
cd "$(dirname "$0")/../.."

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required to parse CLI envelope output. Install with brew install jq." >&2
  exit 1
fi

# Seeding requires write commands; CLI defaults to readonly mode.
export TALENT_GRAPH_MODE=full

# 解析 envelope 的 .data.<field>。失败时打印整个 envelope 供 debug。
parse_field() {
  local envelope=$1 field=$2
  local val
  val=$(echo "$envelope" | jq -r ".data.${field} // empty")
  if [[ -z "$val" ]]; then
    echo "error: failed to parse .data.${field} from envelope:" >&2
    echo "$envelope" >&2
    exit 1
  fi
  echo "$val"
}

add_entity() {
  local type=$1 canonical=$2 desc=$3
  local envelope
  envelope=$(bun src/cli.ts entity add \
    --type "$type" \
    --canonical-name "$canonical" \
    --description "$desc" \
    --force-new)
  parse_field "$envelope" entityId
}

add_tag() {
  local code=$1 name=$2 kind=$3 desc=$4
  local envelope
  envelope=$(bun src/cli.ts tag add \
    --code "$code" \
    --name "$name" \
    --mode list \
    --kind "$kind" \
    --description "$desc")
  parse_field "$envelope" tagId
}

# $1=entity_type $2=entity_uuid $3=raw_name
add_alias() {
  bun src/cli.ts alias add --type "$1" --raw-name "$3" --entity "$2" >/dev/null
}

link() {
  bun src/cli.ts tag link --tag "$1" --entity "$2" >/dev/null
}

echo "=== 建 MBB 标签 + 3 家公司 ===" >&2
add_tag mbb MBB company "三家顶级战略咨询公司(McKinsey / BCG / Bain)" >/dev/null

MCK=$(add_entity company "麦肯锡" "McKinsey & Company — 全球顶级战略咨询")
BCG=$(add_entity company "BCG" "Boston Consulting Group — 全球顶级战略咨询")
BAIN=$(add_entity company "贝恩" "Bain & Company — 全球顶级战略咨询")

add_alias company "$MCK" "McKinsey & Company"
add_alias company "$MCK" "McKinsey"
add_alias company "$BCG" "Boston Consulting Group"
add_alias company "$BCG" "波士顿咨询"
add_alias company "$BAIN" "Bain & Company"
add_alias company "$BAIN" "Bain"

link mbb "$MCK"
link mbb "$BCG"
link mbb "$BAIN"

echo "=== 建藤校标签 + 8 所学校 ===" >&2
add_tag ivy_league 藤校 school "美国常春藤盟校 8 所" >/dev/null

HARVARD=$(add_entity school "哈佛大学"     "Harvard University — 常春藤盟校,马萨诸塞州剑桥")
YALE=$(add_entity    school "耶鲁大学"     "Yale University — 常春藤盟校,康涅狄格州纽黑文")
PRINCETON=$(add_entity school "普林斯顿大学" "Princeton University — 常春藤盟校,新泽西州")
UPENN=$(add_entity   school "宾夕法尼亚大学" "University of Pennsylvania — 常春藤盟校,费城")
COLUMBIA=$(add_entity school "哥伦比亚大学"  "Columbia University — 常春藤盟校,纽约")
CORNELL=$(add_entity school "康奈尔大学"    "Cornell University — 常春藤盟校,纽约州伊萨卡")
DARTMOUTH=$(add_entity school "达特茅斯学院" "Dartmouth College — 常春藤盟校,新罕布什尔州")
BROWN=$(add_entity   school "布朗大学"      "Brown University — 常春藤盟校,罗德岛州")

add_alias school "$HARVARD"   "Harvard University"
add_alias school "$HARVARD"   "Harvard"
add_alias school "$YALE"      "Yale University"
add_alias school "$PRINCETON" "Princeton University"
add_alias school "$UPENN"     "University of Pennsylvania"
add_alias school "$UPENN"     "UPenn"
add_alias school "$COLUMBIA"  "Columbia University"
add_alias school "$CORNELL"   "Cornell University"
add_alias school "$DARTMOUTH" "Dartmouth College"
add_alias school "$BROWN"     "Brown University"

for id in "$HARVARD" "$YALE" "$PRINCETON" "$UPENN" "$COLUMBIA" "$CORNELL" "$DARTMOUTH" "$BROWN"; do
  link ivy_league "$id"
done

echo "=== 建清华大学(非藤校,用于 entity search 验证)===" >&2
TSINGHUA=$(add_entity school "清华大学" "中国顶尖理工科综合性大学,北京")
add_alias school "$TSINGHUA" "Tsinghua University"
add_alias school "$TSINGHUA" "清华"

echo >&2
echo "=== 完成 ===" >&2
echo "验证:" >&2
echo "  bun src/cli.ts diag" >&2
echo "  bun src/cli.ts tag list" >&2
echo "  bun src/cli.ts tag get ivy_league" >&2
echo "  bun src/cli.ts tag members ivy_league" >&2
echo "  bun src/cli.ts entity search 清华 --type school" >&2
