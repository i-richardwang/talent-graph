#!/usr/bin/env bash
# 共享 seed:把 22 个行业桶(facet=industry 的 list 标签)建进测试库。
# 每个 classify case 的 seed 先调它,再 add 自己的待分类实体——tag link 才挂得上,
# 且 `tag list --facet industry` 能返回完整桶清单(skill 据此拿 tag_code)。
# 桶描述与 prod 一致(含已修的 logistics/transportation 对称排除项)。
set -euo pipefail
export TALENT_GRAPH_MODE=full

add() { talent-graph tag add --mode list --kind company --facet industry --code "$1" --name "$2" --description "$3" >/dev/null; }

add ind_banking        "银行"      "银行业:商业银行(国有大行/股份制/城农商行)、政策性银行。不含保险/券商/基金。"
add ind_securities     "证券/投行"  "证券业:券商(含投行/经纪/自营/资管业务条线)、纯投资银行;中外投行均归此(投行是业务条线,不单列)。"
add ind_insurance      "保险"      "保险业:寿险/财险/再保险/保险经纪。不含银行系、券商系资管。"
add ind_asset_mgmt     "基金/资管"  "资产管理:公募、私募(含量化)、券商/银行资管、信托。不含一级市场股权投资(归创投/PE)。"
add ind_pe_vc          "创投/PE"   "一级市场股权投资:VC、PE、FOF、产业投资。不含二级市场资管。"
add ind_consulting     "咨询"      "咨询服务:战略/管理/运营/IT/人力咨询。不含会计所审计本体。"
add ind_accounting     "会计/审计"  "会计师事务所:审计/税务/财务咨询(四大及内资所)。"
add ind_law            "律所"      "律师事务所及法律服务机构。"
add ind_internet       "互联网"    "互联网/软件:平台、软件、SaaS、游戏、电商平台。不含纯硬件制造。"
add ind_automotive     "车企"      "整车制造(传统/合资/新势力);零部件供应商归制造。"
add ind_manufacturing  "制造"      "制造业:工业装备、电子/消费电子制造、半导体、汽车零部件(整车归车企)。本轮含半导体。"
add ind_healthcare     "医药/医疗"  "制药、生物科技、医疗器械、CRO/CDMO、医疗服务。"
add ind_real_estate    "房地产"    "房地产业:房地产开发、物业管理、商业地产运营、房产经纪。建筑施工归建筑/工程。"
add ind_energy         "能源/电力"  "能源业:油气、电力、煤炭、新能源运营(发电/电网/油田)。设备制造归制造。"
add ind_telecom        "电信运营"   "电信运营:基础电信运营商及通信网络服务。通信设备硬件归制造,软件平台归互联网。"
add ind_construction   "建筑/工程"  "建筑工程:建筑施工、基建工程、工程设计/勘察、装饰装修。房地产开发归房地产。"
add ind_consumer       "消费/零售"  "消费零售:快消(FMCG)、零售连锁、餐饮、消费品牌。电商平台归互联网。"
add ind_media          "传媒/文娱"  "传媒文娱:传媒、广告营销、影视/内容、文旅/体育。游戏归互联网。"
add ind_logistics      "物流"      "物流/供应链:快递、货运、仓储、配送。不含旅客运输(客运归交通运输 ind_transportation)。"
add ind_transportation "交通运输"   "交通运输/客运:航空、铁路客运、公路与城际客运、公交、城市轨交。不含货运快递仓储(归物流 ind_logistics)。"
add ind_government     "政府/公共"  "党政机关、事业单位、公共部门(作为雇主)。"
add ind_education      "教育/科研"  "高校、科研院所、培训机构(作为雇主,指任职非教育背景)。"
