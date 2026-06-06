#!/usr/bin/env bash
# C9 0→1 业务搭建 · 边界模糊。蓝本(字节-抖音 数据分析师)。
# 脱敏:仅换姓名(陈奕航)+ emp_id(D926473,逼真同格式);公司(字节抖音/触乐/钧正/每日优鲜)、
#   work_list 全 verbatim,字数不压缩。
# 证据(work_list):反复「参与生活服务从 0 到 1 的发展过程」「参与某休闲游戏平台从 0 到 1 上线过程,输出
#   选品和金币策略」「参与…从 0 到 1 的过程(主要负责参与特征讨论选取、汇报材料制作)」—— 身份始终是
#   数据分析师/策略支持,身处 0→1 并做了贡献,但非主导/亲手搭业务本身;算不算 0→1 业务搭建卡在
#   description 没划清的"身处 0→1 并贡献分析 vs 亲手搭起业务"那条线上。
# 预置:assertion tag「zero_to_one」+ 员工 D926473。
# 期望(边界范式,同 C3):不可 confident——要么不写,要么写 borderline。
set -euo pipefail
export TALENT_GRAPH_MODE=full
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

talent-graph tag add --code zero_to_one --name 0到1业务搭建 --mode assertion --kind experience \
  --description "判定边界:0→1 业务搭建指本人作为核心建设者,把一条新业务 / 新产品 / 新平台从无到有搭起来——定义业务模式、跑通核心闭环、推动它落地成型乃至规模化。例如主导孵化一个新产品线、从零搭起一套新运营 / 增长体系并跑通、作为核心成员把一项新业务从立项做到上线运转等。只是在成熟业务里做日常迭代 / 功能开发 / 局部优化,或虽身处 0→1 的团队 / 公司但本人做的是支持性分析、边缘模块、外围执行而看不出亲手搭了业务本身的,不属于。" >/dev/null

bun "${SCRIPT_DIR}/_employee.ts" < "${SCRIPT_DIR}/zero-to-one-boundary.profile.json"
