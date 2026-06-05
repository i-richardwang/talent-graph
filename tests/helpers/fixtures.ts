// Builder helpers — 测试里反复出现的 entity/tag/alias 创建模式包成一行调用。
// 每个 helper 都验证 envelope.ok,失败时 throw 带完整上下文,测试代码不用判 ok。

import { runCli } from "./cli";

interface BaseOpts {
  dbUrl: string;
}

export interface MakeTagOpts extends BaseOpts {
  code: string;
  name: string;
  mode: "list" | "assertion";
  kind?: string;
  description: string;
}

export async function makeTag(opts: MakeTagOpts): Promise<{
  tagId: string;
  tagCode: string;
}> {
  const args = [
    "tag", "add",
    "--code", opts.code,
    "--name", opts.name,
    "--mode", opts.mode,
    "--description", opts.description,
  ];
  if (opts.kind) args.push("--kind", opts.kind);

  const res = await runCli<{ tagId: string; tagCode: string }>(args, {
    dbUrl: opts.dbUrl,
  });
  if (!res.envelope.ok) {
    throw new Error(
      `makeTag failed: ${JSON.stringify(res.envelope)}\nstderr: ${res.stderr}`,
    );
  }
  return res.envelope.data;
}

export interface MakeEntityOpts extends BaseOpts {
  type: string;
  canonicalName: string;
  description?: string;
  parent?: string;
  /** 默认 true:测试不关心 similar_exists 噪音。需要测拦截行为时设为 false。 */
  forceNew?: boolean;
}

export async function makeEntity(opts: MakeEntityOpts): Promise<{
  entityId: string;
  canonicalName: string;
}> {
  const args = [
    "entity", "add",
    "--type", opts.type,
    "--canonical-name", opts.canonicalName,
  ];
  if (opts.description) args.push("--description", opts.description);
  if (opts.parent) args.push("--parent", opts.parent);
  if (opts.forceNew !== false) args.push("--force-new");

  const res = await runCli<{ entityId: string; canonicalName: string }>(
    args,
    { dbUrl: opts.dbUrl },
  );
  if (!res.envelope.ok) {
    throw new Error(
      `makeEntity failed: ${JSON.stringify(res.envelope)}\nstderr: ${res.stderr}`,
    );
  }
  return res.envelope.data;
}

export interface MakeAliasOpts extends BaseOpts {
  type: string;
  rawName: string;
  entity: string;
  force?: boolean;
}

export async function makeAlias(opts: MakeAliasOpts): Promise<{
  aliasId: string;
}> {
  const args = [
    "alias", "add",
    "--type", opts.type,
    "--raw-name", opts.rawName,
    "--entity", opts.entity,
  ];
  if (opts.force) args.push("--force");

  const res = await runCli<{ aliasId: string }>(args, { dbUrl: opts.dbUrl });
  if (!res.envelope.ok) {
    throw new Error(
      `makeAlias failed: ${JSON.stringify(res.envelope)}\nstderr: ${res.stderr}`,
    );
  }
  return res.envelope.data;
}

export interface LinkTagOpts extends BaseOpts {
  tag: string;
  entity: string;
  matchMode?: "exact" | "subtree";
}

export async function linkTag(opts: LinkTagOpts): Promise<void> {
  const args = ["tag", "link", "--tag", opts.tag, "--entity", opts.entity];
  if (opts.matchMode) args.push("--match-mode", opts.matchMode);

  const res = await runCli(args, { dbUrl: opts.dbUrl });
  if (!res.envelope.ok) {
    throw new Error(
      `linkTag failed: ${JSON.stringify(res.envelope)}\nstderr: ${res.stderr}`,
    );
  }
}
