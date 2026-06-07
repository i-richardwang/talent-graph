#!/usr/bin/env bash
# C12 国际化/出海 · 边界模糊。蓝本(太保/丰泰保险-保险渠道客户经理)。
# 脱敏:仅换姓名(何俊熙)+ emp_id(D659408,逼真同格式);公司(中国太保/丰泰保险亚洲/太平财险)、
#   work_list 全 verbatim。
# 证据(work_list):主体是国内保险渠道管理岗;涉外只有边缘片段——「执行集团交叉业务发展规划(与
#   AXA 其他机构交叉业务、集团全球客户追加销售)」「协助核保部门完成海外新产品条款翻译及报备」
#   「协助做好海外客户的服务工作」。比纯翻译多一点(沾了集团全球客户追加销售),但本人是否实际承担
#   出海业务卡在 description 没划清的「边缘涉外 vs 实际承担出海」那条线上。
# 预置:assertion tag「globalization」+ 员工 D659408。
# 期望(边界范式,同 C3/C6/C9):不可 confident——要么不写,要么写 borderline。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

talent-graph tag add --code globalization --name 国际化出海 --mode assertion --kind experience \
  --description "判定边界:国际化/出海指本人亲身负责或深度参与了把业务 / 产品 / 团队推向海外市场的工作——主导某个海外市场的拓展落地、搭建跨境 / 海外业务链路、组建或运营海外团队 / 子公司等。例如主导某品牌出海某国的全链路运营(选品、定价、清关、本地化营销)、负责海外市场从 0 到 1 的渠道与团队搭建、统筹跨境业务的供应链与合规等。只是任职于有海外业务 / 跨国背景的公司但本人做的是纯国内区域业务,或仅在国内岗位上边缘涉外(如协助接待海外客户、翻译外文材料、对接海外同事)而看不出本人实际承担出海业务的,不属于。" >/dev/null

bun "${SCRIPT_DIR}/_employee.ts" < "${SCRIPT_DIR}/globalization-boundary.profile.json"
