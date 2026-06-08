# talent-graph-web

人才图谱数据的只读多视图前端,基于 **TanStack Start**(全栈 React)。直连父仓库的
Postgres,复用 `../src/db` 的 drizzle schema 与共享只读查询层 `../src/db/queries/`。

> 仅留仓库,不随 npm 包发布(父包 `files` 只发 `dist`)。自托管 / 集成方从 git 取。

## 架构

```
Browser (TanStack Router / Query / Table)
  → server functions (createServerFn, web/src/server/*)   ← 认证 seam 在这里
    → src/db/queries/*  (共享只读层, 派生/聚合逻辑只写一处)
      → src/db/schema + drizzle + pg → Postgres (DATABASE_URL)
```

- **server function = API 层**:`createServerFn().handler()` 在服务端跑,客户端通过自动
  RPC 调用,无独立 API 进程。
- **认证 seam**:`src/server/session.server.ts` 是全站唯一认证收口点(`requireSession()`)。
  v1 是简单密码门;未来迁 Better-auth 只替换这一个文件,业务 server function 不动。
- **server-only 隔离**:直接 import `@tanstack/react-start/server` 的代码必须放
  `*.server.ts`,绝不能进 client 图(否则生产构建的 import-protection 会拦)。

## 运行

需要父仓库的 Postgres 可达(`DATABASE_URL`,默认从 `../.env.local` 读)。

```bash
cd web
bun install
cp .env.example .env      # 设置 APP_PASSWORD(登录密码)+ SESSION_SECRET(≥32 字符)
bun run dev               # http://localhost:3000
```

`bun run dev` / `start` 用 Node `--env-file-if-exists` 依次加载
`../.env.local` → `../.env` → `./.env`,所以 `DATABASE_URL` 复用父仓库的,web 专属密钥
放 `web/.env`(已 gitignore)。

| 命令 | 作用 |
|---|---|
| `bun run dev` | 开发服务器(:3000) |
| `bun run build` | 生产构建(client + SSR bundle) |
| `bun run start` | 跑生产构建产物 |
| `bun run typecheck` | `tsc --noEmit` |

## 视图

设计语言:技术档案册,见 [DESIGN.md](DESIGN.md)。共享原子组件在 `src/components/ui.tsx`。

- ✅ **总览** `/` —— 标签 / 实体 / 员工 / 别名 / borderline 计数与分布(发丝线 registry 条)
- ✅ **标签浏览器** `/tags` · `/tags/$code` —— list / assertion 标签,钻取实体或员工成员(confidence 分页签 + 服务端分页)
- ✅ **实体层级浏览器** `/entities` · `/entities/$id` —— 类型筛 + 搜索 + 分页;详情带父链 breadcrumb、子实体、别名、挂载标签
- ✅ **员工档案** `/employees` · `/employees/$empId` —— 搜索;档案含派生 list 标签(经历→实体→tag 命中路径)+ assertion 标签 + 经历
- ✅ **标签↔实体图谱** `/graph/tag/$code` · `/graph/entity/$id` —— React Flow + dagre,有界子图(结构性只含 tag+entity 节点,不画员工);高扇出时 fitView 限 minZoom 保持可读 + 可平移

派生 list 标签的递归 CTE(经历原始名 → entity_aliases 同 type 精确等值 → 实体 → 沿 parent_id 祖先链 → tag_entity_map exact/subtree → list tag)在 `../src/db/queries/employees.ts`,是名单标签"下游 JOIN 派生"语义的可视化。

## 注意

- 纯只读:所有写操作仍走父仓库 CLI / skill(保留 envelope + audit 语义)。
- TanStack Start 约定:router 入口 `src/router.tsx` 必须导出 `getRouter`(不是
  `createRouter`);`src/routeTree.gen.ts` 首次 dev/build 自动生成(已 gitignore)。
