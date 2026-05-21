# 解析一条 company raw_name 的 entity 归属

对一条原始公司名,判定它在 talent-graph 里应当归属哪个 entity,并写入归属记录。

entity 层级反映业务从属,不反映股权持有。建 entity 用品牌名,不用法律全称。

**建 parent**:raw 在市场上被认知为某集团旗下的子业务/子品牌——品牌身份和集团绑定,不是独立公司。
**不建 parent**:raw 自己是有独立市场认知的公司——即使有控股股东。沿股权链追出控股方当 parent 是错的。
