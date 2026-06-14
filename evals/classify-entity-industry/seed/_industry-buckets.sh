#!/usr/bin/env bash
# 共享 seed:把行业轴(facet=industry,25 桶)+ 模式轴(facet=business_model,平台)建进测试库。
# 每个 classify case 的 seed 先调它,再 add 自己的待分类实体——tag link 才挂得上,
# 且 `tag list --facet industry` / `--facet business_model` 能返回完整桶清单(skill 据此拿 code)。
# 桶定义与 prod 及 prompts/classify-entity-industry/employer-industry.md 对齐。
set -euo pipefail
export TALENT_GRAPH_MODE=full

# 行业轴
ind() { talent-graph tag add --mode list --kind company --facet industry --code "$1" --name "$2" --description "$3" >/dev/null; }
# 模式轴
mdl() { talent-graph tag add --mode list --kind company --facet business_model --code "$1" --name "$2" --description "$3" >/dev/null; }

# --- 金融 ---
ind ind_banking        "银行"      "银行业:商业银行(国有大行/股份制/城农商行)、政策性银行。不含保险/券商/基金。"
ind ind_securities     "证券/投行"  "证券业:券商(含投行/经纪/自营/资管业务条线)、纯投资银行;中外投行均归此。"
ind ind_insurance      "保险"      "保险业:寿险/财险/再保险/保险经纪。不含银行系、券商系资管。"
ind ind_asset_mgmt     "基金/资管"  "资产管理:公募、私募(含量化)、券商/银行资管、信托。不含一级市场股权投资(归创投/PE)。"
ind ind_pe_vc          "创投/PE"   "一级市场股权投资:VC、PE、FOF、产业投资。不含二级市场资管。"
# --- 专业服务 ---
ind ind_consulting     "咨询"      "咨询服务:战略/管理/运营/IT/人力咨询。不含会计所审计本体。"
ind ind_accounting     "会计/审计"  "会计师事务所:审计/税务/财务咨询(四大及内资所)。"
ind ind_law            "律所"      "律师事务所及法律服务机构。"
# --- 数字原生(现实世界无对口行业的数字业务本体)---
ind ind_ecommerce      "电商"      "实物商品线上零售/电商(自营或平台)。平台型在模式轴另挂平台。本地生活/到店到家归消费。"
ind ind_gaming         "游戏"      "游戏研发、发行、运营、电竞。游戏从互联网细分独立。"
ind ind_software       "软件/IT"   "通用软件、SaaS、云计算、开发工具、搜索、AI、IT 服务——卖数字产品本身的公司。垂直在线业务(电商/出行/在线教育等)归其对应行业。"
ind ind_social         "社交/社区"  "社交、即时通讯、UGC 社区/平台。"
# --- 工业/医疗 ---
ind ind_automotive     "车企"      "整车制造(传统/合资/新势力);零部件供应商归制造,汽车经销零售归消费。"
ind ind_manufacturing  "制造"      "制造业:工业装备、电子/消费电子制造、半导体、汽车零部件(整车归车企)。"
ind ind_healthcare     "医药/医疗"  "制药、生物科技、医疗器械、CRO/CDMO、医疗服务;含互联网医疗(平台型另挂平台)。"
# --- 基础设施/民生 ---
ind ind_real_estate    "房地产"    "房地产业:房地产开发、物业管理、商业地产运营、房产经纪。建筑施工归建筑/工程。"
ind ind_energy         "能源/电力"  "能源业:油气、电力、煤炭、新能源运营(发电/电网/油田)。设备制造归制造。"
ind ind_telecom        "电信运营"   "电信运营:基础电信运营商及通信网络服务。通信设备硬件归制造,软件平台归软件IT。"
ind ind_construction   "建筑/工程"  "建筑工程:建筑施工、基建工程、工程设计/勘察、装饰装修。房地产开发归房地产。"
ind ind_consumer       "消费/零售"  "消费零售:快消(FMCG)、线下零售连锁、餐饮、本地生活、消费品牌、汽车经销。实物电商归电商。"
ind ind_media          "传媒/文娱"  "传媒文娱:传媒、广告营销、影视/内容/直播、文旅/体育。游戏归游戏。"
# --- 交通/物流 ---
ind ind_transportation "交通运输"   "交通运输/客运:航空、铁路客运、公路与城际客运、公交、城市轨交、出行(含出行平台,平台型另挂平台)。货运快递仓储归物流。"
ind ind_logistics      "物流"      "物流/供应链:快递、货运、仓储、配送(含货运平台,平台型另挂平台)。旅客运输归交通运输。"
# --- 公共服务 ---
ind ind_government     "政府/公共"  "党政机关、事业单位、公共部门(作为雇主)。"
ind ind_education      "教育/科研"  "高校、科研院所、培训机构(作为雇主,指任职非教育背景);含在线教育。"

# --- 模式轴 ---
mdl mdl_platform       "平台"      "平台型公司:撮合/连接供需两方、自己不下场生产或自营(电商平台、出行平台、本地生活平台、招聘/中介平台等)。自营/实体不挂。"
