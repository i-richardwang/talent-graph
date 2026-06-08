import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { loginFn } from "~/server/session";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await loginFn({ data: { password } });
    setPending(false);
    if (res.ok) {
      await router.invalidate();
      await router.navigate({ to: "/" });
    } else {
      setError(res.error);
    }
  }

  return (
    <div className="mx-auto mt-24 max-w-sm">
      <div className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.012em]">
        <span className="size-2.5 rounded-[3px] bg-accent" aria-hidden />
        talent<span className="text-ink-3">/</span>graph
      </div>
      <h1 className="mt-6 text-xl font-semibold tracking-[-0.012em]">登录</h1>
      <p className="mt-1 text-sm text-ink-3">内部数据,请输入访问密码。</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="密码"
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-tint"
        />
        {error && <p className="text-sm text-borderline">{error}</p>}
        <button
          type="submit"
          disabled={pending || !password}
          className="w-full rounded-sm bg-ink px-3 py-2 text-sm font-medium text-white transition-[transform,opacity] duration-150 active:scale-[0.98] disabled:opacity-40"
        >
          {pending ? "验证中…" : "登录"}
        </button>
      </form>
    </div>
  );
}
