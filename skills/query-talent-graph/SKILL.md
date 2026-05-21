---
name: query-talent-graph
description: 查询 talent-graph 数据：标签清单、标签覆盖的标准实体、员工 profile（教育 / 工作经历 / 简历）、实体的写法变体、schema 变更历史
argument-hint: [<intent-description>]
disable-model-invocation: true
---

talent-graph 保存"业务标签 → 标准实体 → 员工 profile"三层映射。用本 skill 列出的 `talent-graph` 命令组合回答用户的查询。

任务: $ARGUMENTS

---

## 输出协议

所有命令 stdout 是单一 envelope JSON `{ok, status, data, meta}`。按 `status` 离散分支(`ok` 仅是 exit code 镜像,分支判决看 `status`)。

## 命令清单

所有命令都通过 `talent-graph <noun> <verb>` 调用。命令是 noun-verb 结构（类似 `git remote add`）：先选 noun（`tag` / `entity` / `employee` / `alias` / `audit`），再选 verb。

| 命令 | 用途 |
|---|---|
| `tag list [--mode M] [--domain D]` | 列出所有标签;`--mode list` / `--mode assertion` 过滤模式,`--domain company` 等过滤名单标签的实体域 |
| `tag get <code\|id>` | 看单个标签的定义和成员数量 |
| `tag members <code\|id>` | 看挂在标签下的成员清单（判定标签返回员工清单，名单标签返回标准实体清单） |
| `entity list [--type T]` | 列出标准实体（按类型过滤） |
| `entity get <uuid>` | 看实体详情：身份说明 + 写法变体（aliases）+ 关联的标签 + 父子层级 |
| `entity get <type> <name>` | 同上，但按 (type, canonical name) 二元组查 |
| `entity search <query> --type T` | 按名字模糊搜索实体 |
| `employee get <emp_id>` | 看员工的完整 profile：姓名 + 工作经历 + 教育经历 + 最新简历 + 关联的标签 |
| `employee search <query>` | 按姓名子串搜员工 |
| `alias list [filters]` | 列出"原始写法 → 标准实体"的映射（过滤参数：`--type` / `--entity <uuid>` / `--raw-name <name>`） |
| `audit list [filters]` | 看历史变更（哪条标签 / 别名被改过 / 删过），用于追溯异常 |

`diag` 是部署侧自检命令，本 skill 工作流不需要。

---

## 常见查询模式

### 浏览有哪些标签

```bash
talent-graph tag list
# 按 mode 过滤
talent-graph tag list --mode assertion        # 只列判定标签
talent-graph tag list --mode list --domain company  # 只列公司域名单标签
```

**`description` 是业务方写明的判定边界 prose**，告诉用户某个 tag 的含义时直接引用它，不要按字面 tagCode/tagName 自行解读。

### 看某标签具体覆盖了哪些（学校 / 公司）实体

```bash
talent-graph tag members mbb           # tagCode 或 UUID 都可以
```

名单标签的成员是标准实体。**`matchMode`** 决定挂载的传递性：`'subtree'` 时此实体及所有后代都算命中（如 `互联网公司 → 阿里巴巴(subtree)` 会让菜鸟员工也命中），`'exact'` 仅命中实体本身。`reasoning` 是当初挂入时业务方写的入选依据。

需要 tag 自身的元数据（成员总数 / description）→ `tag get`。

### 找出有某标签的员工

```bash
talent-graph tag members <assertion-tag>
```

判定标签的成员是员工。`tag members` 一次返回 `empId` + `name` + `reasoning`，不需要再逐条 `employee get` 才知道姓名。需要某个员工的完整工作 / 教育经历时再 `employee get`。

### 查员工详情

```bash
talent-graph employee get D115089
```

返回结构化 profile + 一份最新简历（取 `updateTime` DESC）。

两个非显然约束：

- `resume.workList` 是 JSON 字符串而非数组（含每段经历的 description / jobResp 等富文本），自己解析后通读。
- `resume` 可能为 `null`（该员工无简历）；这是正常状态，按 `workExperience` + `education` 回答即可。

### 查实体的所有写法变体

用户输入了某种公司名 / 学校名变体（如"清华大"、"McKinsey"），想知道它对应哪个标准实体：

```bash
talent-graph alias list --raw-name "McKinsey & Company"
talent-graph entity get <uuid>   # 拿到 entity UUID 后看完整变体清单
```

`entity get` 同时返回 `aliases`（写法变体）、`children`（直接子实体，一层）、`parentId`（父实体 UUID）。

### 模糊搜索实体

```bash
talent-graph entity search "清华" --type school
```

返回 `exact[]`（字面命中，每条 `matchSource` 标识命中是 canonical 还是某条 alias）和 `similar[]`（足够像，按相关性排序，可能为空）。

`--type` 是为了避免跨域误命中——同名 raw（"清华大学"既可能是 school 又可能是 company）在不同 entity_type 下完全独立。

### 按姓名搜员工

```bash
talent-graph employee search "张三"
```

返回姓名包含该子串的员工，从中挑对的 emp_id 后再 `employee get` 拉详情。

### 查历史变更

```bash
talent-graph audit list                           # 最近 20 条
talent-graph audit list --tag mbb                 # 按标签反查 tag 解绑
talent-graph audit list --raw-name "Microsoft"    # 按某个 raw_name 反查 alias 改判
```

filter 关注的事实存储不一样：

- `--tag` 同时覆盖 `tag_entity_map`（`tag unlink` 留下的）与 `employee_tag_map`（`employee tag-remove` 留下的），按 `tableName` 区分
- `--raw-name` 只覆盖 `entity_aliases`（`alias add --force` 改判留下的）
- `--entity` 覆盖含 entityId 的审计行（`tag_entity_map` / `entity_aliases`）
- 不确定筛哪类时省略 filter，按 `tableName` 自己过滤 `data[]`

---

## 注意

- **本 skill 只用于查询**:如果用户希望改数据(加标签、新增映射等),告知"这超出本 skill 范围",让用户走相应维护流程。
- **`tags.description` 是业务方写的 prose,会演进**:当作"判定边界的当前定义"用,不要当 ground truth 直接断言"X 一定属于 Y"。
