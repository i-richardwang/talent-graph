// Run `bun src/cli.ts <args>` as a subprocess with DATABASE_URL pinned to
// the lease's worker DB. Returns parsed envelope + raw stderr + exit code.
//
// CLI 默认只读,绝大多数测试需要写,所以 mode 默认 'full'。需要测 readonly 拦截
// 行为时显式传 mode: 'readonly'。

import { spawn } from "bun";

export interface Envelope<T = unknown> {
  ok: boolean;
  status: string;
  data: T;
  meta: {
    command: string;
    [key: string]: unknown;
  };
}

export interface CliResult<T = unknown> {
  envelope: Envelope<T>;
  stderr: string;
  exitCode: number;
}

export async function runCli<T = unknown>(
  args: string[],
  opts: { dbUrl: string; mode?: "readonly" | "full" },
): Promise<CliResult<T>> {
  const proc = spawn({
    cmd: ["bun", "src/cli.ts", ...args],
    env: {
      ...process.env,
      DATABASE_URL: opts.dbUrl,
      TALENT_GRAPH_MODE: opts.mode ?? "full",
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;

  let envelope: Envelope<T>;
  try {
    envelope = JSON.parse(stdout) as Envelope<T>;
  } catch {
    throw new Error(
      `runCli: stdout is not valid JSON envelope.\n` +
        `args: ${JSON.stringify(args)}\n` +
        `exitCode: ${exitCode}\n` +
        `stdout:\n${stdout}\n` +
        `stderr:\n${stderr}`,
    );
  }

  return { envelope, stderr, exitCode };
}
