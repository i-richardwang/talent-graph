本次任务:给公司实体「菜鸟网络」判定雇主行业归属并逐桶挂载。只判这一个实体。

/classify-entity-industry 菜鸟网络

数据库连接通过 `DATABASE_URL` 注入。`talent-graph ...` 直接调用(已在 PATH);实体已在库中,用 `talent-graph entity get company 菜鸟网络` 按标准名精确拿到 entityId 与主营描述再判。判主营可用搜索工具。除数据库(经 talent-graph 命令)外,不要主动读取仓库里的其他文件。
