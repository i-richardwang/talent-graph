#!/usr/bin/env bash
# C7 0→1 业务搭建 · clean-hit。蓝本(蚂蚁财富-用户成长运营专家)。
# 脱敏:仅换姓名(周可昕)+ emp_id(D805231,逼真同格式);公司(蚂蚁财富/平安银行/360金融/陆金所)、
#   work_list 全 verbatim,字数不压缩。
# 证据(work_list):蚂蚁财富「由本人主导,从 0 到 1 搭建了…针对高净值用户的权益运营体系——财富黑卡」,
#   建成评价/权益/服务/产品全套运营系统并规模化覆盖 —— 本人主导把一条新业务从无到有搭起来,干净命中。
# 预置:assertion tag「zero_to_one」(0 到 1 业务搭建, kind=experience)+ 员工 D805231。
# 期望:/tag-employee 判 confident 命中。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

talent-graph tag add --code zero_to_one --name 0到1业务搭建 --mode assertion --kind experience \
  --description "判定边界:0→1 业务搭建指本人作为核心建设者,把一条新业务 / 新产品 / 新平台从无到有搭起来——定义业务模式、跑通核心闭环、推动它落地成型乃至规模化。例如主导孵化一个新产品线、从零搭起一套新运营 / 增长体系并跑通、作为核心成员把一项新业务从立项做到上线运转等。只是在成熟业务里做日常迭代 / 功能开发 / 局部优化,或虽身处 0→1 的团队 / 公司但本人做的是支持性分析、边缘模块、外围执行而看不出亲手搭了业务本身的,不属于。" >/dev/null

bun "${SCRIPT_DIR}/_employee.ts" < "${SCRIPT_DIR}/zero-to-one-clean-hit.profile.json"
