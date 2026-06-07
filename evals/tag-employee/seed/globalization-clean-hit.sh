#!/usr/bin/env bash
# C10 国际化/出海 · clean-hit。蓝本(京东-海外电商运营经理)。
# 脱敏:仅换姓名(赵承宇)+ emp_id(D713620,逼真同格式);公司(京东/正浩创新)、
#   work_list 全 verbatim,字数不压缩。
# 证据(work_list):京东海外电商运营经理「主导小家电品牌"gmbear"从 0 到 1 的跨境出海项目全链路
#   管理:供应商谈判、进出口报关清关协调及风控、本地化定价、海外大促运营、跨境流程优化」——
#   本人亲身主导某品牌出海某国的全链路,干净命中。
# 预置:assertion tag「globalization」(国际化出海, kind=experience)+ 员工 D713620。
# 期望:/tag-employee 判 confident 命中。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

talent-graph tag add --code globalization --name 国际化出海 --mode assertion --kind experience \
  --description "判定边界:国际化/出海指本人亲身负责或深度参与了把业务 / 产品 / 团队推向海外市场的工作——主导某个海外市场的拓展落地、搭建跨境 / 海外业务链路、组建或运营海外团队 / 子公司等。例如主导某品牌出海某国的全链路运营(选品、定价、清关、本地化营销)、负责海外市场从 0 到 1 的渠道与团队搭建、统筹跨境业务的供应链与合规等。只是任职于有海外业务 / 跨国背景的公司但本人做的是纯国内区域业务,或仅在国内岗位上边缘涉外(如协助接待海外客户、翻译外文材料、对接海外同事)而看不出本人实际承担出海业务的,不属于。" >/dev/null

bun "${SCRIPT_DIR}/_employee.ts" < "${SCRIPT_DIR}/globalization-clean-hit.profile.json"
