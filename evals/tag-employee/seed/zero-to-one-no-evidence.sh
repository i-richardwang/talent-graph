#!/usr/bin/env bash
# C8 0→1 业务搭建 · 证据不足(不属于)。蓝本(新氧-Android 开发工程师)。
# 脱敏:仅换姓名(刘子轩)+ emp_id(D417629,逼真同格式);公司(新氧/九识佳)、work_list 全 verbatim。
# 证据(work_list):纯 Android 客户端开发——「app 内核心业务魔镜和首页开发与改版」「性能优化与崩溃
#   治理」「组件化」「日常功能开发和维护」「参与产品功能设计与讨论」。在成熟 app 里做功能开发/优化,
#   没有任何"把新业务从无到有搭起来"的经历。
# 预置:assertion tag「zero_to_one」+ 员工 D417629。
# 期望:/tag-employee 判证据不足,不写(无 zero_to_one tag-add)。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

talent-graph tag add --code zero_to_one --name 0到1业务搭建 --mode assertion --kind experience \
  --description "判定边界:0→1 业务搭建指本人作为核心建设者,把一条新业务 / 新产品 / 新平台从无到有搭起来——定义业务模式、跑通核心闭环、推动它落地成型乃至规模化。例如主导孵化一个新产品线、从零搭起一套新运营 / 增长体系并跑通、作为核心成员把一项新业务从立项做到上线运转等。只是在成熟业务里做日常迭代 / 功能开发 / 局部优化,或虽身处 0→1 的团队 / 公司但本人做的是支持性分析、边缘模块、外围执行而看不出亲手搭了业务本身的,不属于。" >/dev/null

bun "${SCRIPT_DIR}/_employee.ts" < "${SCRIPT_DIR}/zero-to-one-no-evidence.profile.json"
