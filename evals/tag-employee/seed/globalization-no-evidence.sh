#!/usr/bin/env bash
# C11 国际化/出海 · 证据不足(不属于)。蓝本(三星/博西家电-广西区域渠道经理)。
# 脱敏:仅换姓名(孙佳怡)+ emp_id(D384571,逼真同格式);公司(三星/博西家电/格力/阿里)、
#   work_list 全 verbatim。
# 证据(work_list):公司均为跨国/海外背景(三星韩国、博西德国 BSH 跨国集团),但本人全程做
#   广西/南宁区域的渠道开发、经销商管理、导购培训、卖场管理——纯国内区域业务,没有任何本人承担
#   出海/跨境业务的经历。"任职跨国公司 ≠ 本人做了国际化"的典型干扰样本。
# 预置:assertion tag「globalization」+ 员工 D384571。
# 期望:/tag-employee 判证据不足,不写(无 globalization tag-add)。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

talent-graph tag add --code globalization --name 国际化出海 --mode assertion --kind experience \
  --description "判定边界:国际化/出海指本人亲身负责或深度参与了把业务 / 产品 / 团队推向海外市场的工作——主导某个海外市场的拓展落地、搭建跨境 / 海外业务链路、组建或运营海外团队 / 子公司等。例如主导某品牌出海某国的全链路运营(选品、定价、清关、本地化营销)、负责海外市场从 0 到 1 的渠道与团队搭建、统筹跨境业务的供应链与合规等。只是任职于有海外业务 / 跨国背景的公司但本人做的是纯国内区域业务,或仅在国内岗位上边缘涉外(如协助接待海外客户、翻译外文材料、对接海外同事)而看不出本人实际承担出海业务的,不属于。" >/dev/null

bun "${SCRIPT_DIR}/_employee.ts" < "${SCRIPT_DIR}/globalization-no-evidence.profile.json"
