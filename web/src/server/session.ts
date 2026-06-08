import { createServerFn } from "@tanstack/react-start";
import { useAppSession } from "./session.server";

// 认证 seam 的 server function 包装层 —— 客户端可安全 import(handler 会被框架抽到
// server 侧,server-only 的 useSession 通过 ./session.server 隔离,不进 client 图)。
// __root / login 路由从这里取 fetchAuthState / loginFn / logoutFn。

export const fetchAuthState = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await useAppSession();
    return { authed: Boolean(session.data.authed) };
  },
);

export const loginFn = createServerFn({ method: "POST" })
  .validator((data: { password: string }) => data)
  .handler(async ({ data }) => {
    const expected = process.env.APP_PASSWORD;
    if (!expected) {
      return {
        ok: false as const,
        error: "服务端未配置 APP_PASSWORD,无法登录。",
      };
    }
    if (data.password !== expected) {
      return { ok: false as const, error: "密码错误。" };
    }
    const session = await useAppSession();
    await session.update({ authed: true });
    return { ok: true as const };
  });

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useAppSession();
  await session.clear();
  return { ok: true as const };
});
