#!/usr/bin/env bash
# case 9: raw=京东方 + context_hint(显示面板制造业)。
# Base 60 有"京东"但没有"京东方"——京东方是 BOE,液晶面板厂,跟京东电商无关。
# 京东方母公司是北京电子控股(BEHC),国资 holding 平台,不在业务关心范围内。
# 测点:(1) Agent 用 context_hint 缩窄判决,**不应该**因字面包含"京东"就错挂到
# base 的"京东" entity;(2) 沿股权链向上找不到 base 已有祖先 + 国资 holding 不在
# 业务关心范围 → Agent 应建独立京东方 entity 无 parent。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bun "${SCRIPT_DIR}/_base-companies.ts"
