本次任务:解析 `entity_type=company` 的原始名 `京东方`,判定它在 talent-graph 里应当归属哪个 entity 并写入归属记录。

附加上下文:该 raw_name 出现在显示面板制造业员工的简历背景中。

数据库连接通过 `DATABASE_URL` 环境变量注入。所有 `talent-graph ...` 请使用绝对路径调用:`talent-graph <args...>`。

除本次任务指向的 raw_name 外,不要主动搜索或读取其他业务文件。
