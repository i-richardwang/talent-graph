完整阅读 `prompts/define-tag/notable-employer-tag.md`(项目级 prompt,包含本次任务的全部业务约束与产出要求),并按其要求执行。

本次任务的具体参数:`/define-tag company MBB`

数据库连接通过 `DATABASE_URL` 环境变量注入。所有 `talent-graph ...` 请使用绝对路径调用:`talent-graph <args...>`。

完成后按项目 prompt 末尾「完成时输出一行结果」要求输出 4 行总结。

除 prompt 明确指出的文件、以及本任务过程中你自己产出的文件外,不要主动搜索或读取其他文件。
