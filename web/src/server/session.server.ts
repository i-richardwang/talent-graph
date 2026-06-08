import { useSession } from "@tanstack/react-start/server";
import { redirect } from "@tanstack/react-router";

// ──────────────────────────────────────────────────────────────────────────
// 认证 seam(server-only 部分)—— 全站唯一的认证收口点。
//
// 本文件直接 import 了 server-only 的 `@tanstack/react-start/server`,因此必须
// 是 `.server.ts`:只能被 server function 的 handler(或其他 server 代码)引用,
// 绝不能进入 client 图(否则生产构建的 import-protection 会拦)。
//
// v1 是简单密码门;未来迁 Better-auth 时只替换本文件的实现,
// 所有业务 server function 只依赖 `requireSession()` 契约,调用方不动。
// ──────────────────────────────────────────────────────────────────────────

export interface SessionData {
  authed?: boolean;
}

// session cookie 加密口令,至少 32 字符;dev 缺省值仅用于本地,生产必须设 SESSION_SECRET。
// 生产 fail-closed:NODE_ENV=production 下若没设 SESSION_SECRET,直接报错而不是
// 退回到这个仓库里公开可见的 dev 口令(否则任何人都能伪造已登录的 cookie)。
if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  throw new Error(
    "SESSION_SECRET 未设置:生产环境必须提供 ≥32 字符的随机口令,拒绝退回公开 dev 口令。",
  );
}
const SESSION_PASSWORD =
  process.env.SESSION_SECRET ??
  "talent-graph-dev-session-secret-change-me-please";

export function useAppSession() {
  return useSession<SessionData>({
    name: "tg_session",
    password: SESSION_PASSWORD,
  });
}

// 业务 server function 的统一门禁:未登录直接 redirect 到 /login。
export async function requireSession() {
  const session = await useAppSession();
  if (!session.data.authed) {
    throw redirect({ to: "/login" });
  }
  return session;
}
