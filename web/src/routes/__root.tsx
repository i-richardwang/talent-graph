/// <reference types="vite/client" />
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useRouter,
} from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import type { ReactNode } from "react";
import { fetchAuthState, logoutFn } from "~/server/session";
import appCss from "~/styles/app.css?url";

// Router Devtools 仅开发期加载:生产构建里 import.meta.env.PROD 为静态 true,
// 整个 lazy import 被 tree-shake 掉,devDependency 不会进生产产物。
const RouterDevtools = import.meta.env.PROD
  ? () => null
  : lazy(() =>
      import("@tanstack/react-router-devtools").then((m) => ({
        default: m.TanStackRouterDevtools,
      })),
    );

export const Route = createRootRoute({
  beforeLoad: async () => {
    const { authed } = await fetchAuthState();
    return { authed };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Talent Graph" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
});

const NAV: {
  to: "/" | "/tags" | "/entities" | "/employees";
  label: string;
  exact?: boolean;
}[] = [
  { to: "/", label: "总览", exact: true },
  { to: "/tags", label: "标签" },
  { to: "/entities", label: "实体" },
  { to: "/employees", label: "员工" },
];

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  const { authed } = Route.useRouteContext();
  const router = useRouter();

  return (
    <html lang="zh">
      <head>
        <HeadContent />
      </head>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-sm focus:bg-ink focus:px-3 focus:py-1.5 focus:text-sm focus:text-white"
        >
          跳到主内容
        </a>
        <div className="min-h-screen">
          <header className="border-b border-border bg-surface">
            <div className="mx-auto flex h-14 max-w-6xl items-center gap-7 px-6">
              <Link
                to="/"
                className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.012em]"
              >
                <span
                  className="size-2.5 rounded-[3px] bg-accent"
                  aria-hidden
                />
                talent<span className="text-ink-3">/</span>graph
              </Link>
              {authed && (
                <nav className="flex items-center gap-0.5 text-sm">
                  {NAV.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      activeOptions={{ exact: item.exact ?? false }}
                      className="rounded-sm px-2.5 py-1.5 text-ink-2 transition-[color,background-color] duration-150 active:scale-[0.98] [@media(hover:hover)]:hover:bg-sunken"
                      activeProps={{
                        className:
                          "rounded-sm px-2.5 py-1.5 bg-accent-tint text-accent-strong font-medium active:scale-[0.98]",
                      }}
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>
              )}
              <div className="ml-auto text-sm">
                {authed ? (
                  <button
                    type="button"
                    onClick={() =>
                      logoutFn()
                        .then(() => router.invalidate())
                        .then(() => router.navigate({ to: "/login" }))
                    }
                    className="rounded-sm px-2.5 py-1.5 text-ink-3 transition-[color,background-color] duration-150 active:scale-[0.98] [@media(hover:hover)]:hover:bg-sunken [@media(hover:hover)]:hover:text-ink-2"
                  >
                    退出
                  </button>
                ) : (
                  <Link
                    to="/login"
                    className="rounded-sm px-2.5 py-1.5 text-ink-2 [@media(hover:hover)]:hover:bg-sunken"
                  >
                    登录
                  </Link>
                )}
              </div>
            </div>
          </header>
          <main
            id="main-content"
            className="mx-auto max-w-6xl px-6 py-8"
          >
            {children}
          </main>
        </div>
        <Suspense>
          <RouterDevtools />
        </Suspense>
        <Scripts />
      </body>
    </html>
  );
}
