#!/usr/bin/env bash
# case 5: 航天科工203所(真实实体)—— 国防科研院所(计量测试/时频),非武器制造厂。
# 期望:军工/国防科研院所归 ind_education;不当 ind_manufacturing。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/_industry-buckets.sh"

talent-graph entity add --type company --canonical-name "航天科工203所" \
  --description "中国航天科工集团第二研究院二〇三研究所（简称203所），1957年创建于北京，对外名称北京无线电计量测试研究所，国防科技工业计量科研项目管理办公室及航天科工集团二院武器装备综合保障工程技术研究中心，以无线电计量测试、时间频率计量、电磁兼容检测、宇航级晶体元器件、原子钟时频产品为核心业务的国防科研单位" >/dev/null
