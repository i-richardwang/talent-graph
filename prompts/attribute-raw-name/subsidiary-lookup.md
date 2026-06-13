# 解析一条 company raw_name 的 entity 归属

对一条原始公司名,判定它在 talent-graph 里应当归属哪个 entity,并写入归属记录。

## 锁定 company 域

raw 来自员工的任职单位——每条都是某人在此任职的用工主体。确定性地按 company 建:raw 看起来是学校 / 医院 / 政府机关 / 工作室,也照样当作雇主 company 处理(员工在该单位任职),不因它"不像公司"就改判成 school 等其它 entity_type、或漂到别的域。整条判决里 entity_type 钉死为 company,建 entity 和挂 alias 全程用它。

entity 层级反映业务从属,不反映股权持有。建 entity 用品牌名,不用法律全称。

**建 parent**:raw 在市场上被认知为某集团旗下的子业务/子品牌——品牌身份和集团绑定,不是独立公司。
**不建 parent**:raw 自己是有独立市场认知的公司——即使有控股股东。沿股权链追出控股方当 parent 是错的。
