// 首个端到端闭环:用 CLI 把 MBB 名单标签从零搭起来,再查回成员清单。
// 覆盖 tag.add / entity.add / alias.add / tag.link / tag.members 这条主线。

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { acquire, type Lease } from "../helpers/pool";
import { truncateAll } from "../helpers/reset";
import { runCli } from "../helpers/cli";
import { makeTag, makeEntity, makeAlias, linkTag } from "../helpers/fixtures";

interface ListTagMember {
  entityId: string;
  canonicalName: string;
  description: string | null;
  matchMode: "exact" | "subtree";
  reasoning: string | null;
}

interface TagMembersResp {
  tagId: string;
  tagCode: string;
  mode: "list" | "assertion";
  kind: string;
  members: ListTagMember[];
}

describe("MBB list-tag closed loop", () => {
  let lease: Lease;

  beforeAll(async () => {
    lease = await acquire();
  });

  afterAll(async () => {
    await lease.release();
  });

  beforeEach(async () => {
    await truncateAll(lease.dbUrl);
  });

  test("create tag → entities → aliases → link → query members", async () => {
    // 1. tag add — 名单标签 mbb (kind=company)
    const tag = await makeTag({
      dbUrl: lease.dbUrl,
      code: "mbb",
      name: "MBB",
      mode: "list",
      kind: "company",
      description:
        "三家顶级战略咨询公司(McKinsey / BCG / Bain)。判定边界:全球战略咨询业务为主,非纯审计 / 非投行。",
    });
    expect(tag.tagCode).toBe("mbb");
    expect(tag.tagId).toMatch(/^[0-9a-f-]{36}$/);

    // 2. entity add ×3 — 三家 company
    const mck = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "麦肯锡",
      description: "McKinsey & Company",
    });
    const bcg = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "BCG",
      description: "Boston Consulting Group",
    });
    const bain = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "贝恩",
      description: "Bain & Company",
    });

    // 3. alias add ×6 — 每家两条 raw_name
    await makeAlias({
      dbUrl: lease.dbUrl,
      type: "company",
      rawName: "McKinsey & Company",
      entity: mck.entityId,
    });
    await makeAlias({
      dbUrl: lease.dbUrl,
      type: "company",
      rawName: "McKinsey",
      entity: mck.entityId,
    });
    await makeAlias({
      dbUrl: lease.dbUrl,
      type: "company",
      rawName: "Boston Consulting Group",
      entity: bcg.entityId,
    });
    await makeAlias({
      dbUrl: lease.dbUrl,
      type: "company",
      rawName: "波士顿咨询",
      entity: bcg.entityId,
    });
    await makeAlias({
      dbUrl: lease.dbUrl,
      type: "company",
      rawName: "Bain & Company",
      entity: bain.entityId,
    });
    await makeAlias({
      dbUrl: lease.dbUrl,
      type: "company",
      rawName: "Bain",
      entity: bain.entityId,
    });

    // 4. tag link ×3
    for (const e of [mck, bcg, bain]) {
      await linkTag({ dbUrl: lease.dbUrl, tag: "mbb", entity: e.entityId });
    }

    // 5. tag members — 验证三家都挂上了
    const members = await runCli<TagMembersResp>(
      ["tag", "members", "mbb"],
      { dbUrl: lease.dbUrl },
    );
    expect(members.envelope.ok).toBe(true);
    expect(members.envelope.data.mode).toBe("list");
    expect(members.envelope.data.kind).toBe("company");
    expect(members.envelope.data.members).toHaveLength(3);

    const memberIds = members.envelope.data.members
      .map((m) => m.entityId)
      .sort();
    const expectedIds = [mck.entityId, bcg.entityId, bain.entityId].sort();
    expect(memberIds).toEqual(expectedIds);

    // 默认 match_mode 应该是 subtree
    for (const m of members.envelope.data.members) {
      expect(m.matchMode).toBe("subtree");
    }
  });

  test("idempotency: 重复 tag add 同 code 走 already_exists,不报错", async () => {
    const first = await makeTag({
      dbUrl: lease.dbUrl,
      code: "ivy_league",
      name: "藤校",
      mode: "list",
      kind: "school",
      description: "美国常春藤盟校 8 所",
    });

    const second = await runCli<{ tagId: string; tagCode: string }>(
      [
        "tag", "add",
        "--code", "ivy_league",
        "--name", "藤校",
        "--mode", "list",
        "--kind", "school",
        "--description", "美国常春藤盟校 8 所",
      ],
      { dbUrl: lease.dbUrl },
    );
    expect(second.envelope.ok).toBe(true);
    expect(second.envelope.status).toBe("already_exists");
    expect(second.envelope.data.tagId).toBe(first.tagId);
  });

  test("cross-domain link 被拦截:school tag 不能挂 company entity", async () => {
    await makeTag({
      dbUrl: lease.dbUrl,
      code: "ivy_league",
      name: "藤校",
      mode: "list",
      kind: "school",
      description: "美国常春藤盟校 8 所",
    });
    const mck = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "麦肯锡",
    });

    const res = await runCli(
      ["tag", "link", "--tag", "ivy_league", "--entity", mck.entityId],
      { dbUrl: lease.dbUrl },
    );
    expect(res.envelope.ok).toBe(false);
    expect(res.envelope.status).toBe("cross_domain_rejected");
    expect(res.exitCode).toBe(1);
  });

  test("assertion 标签:--kind skill / experience 成功创建", async () => {
    const skill = await makeTag({
      dbUrl: lease.dbUrl,
      code: "rec_ranking_skill",
      name: "推荐排序技能",
      mode: "assertion",
      kind: "skill",
      description: "做过推荐 / 搜索 / 广告的召回或排序算法研发。",
    });
    expect(skill.tagCode).toBe("rec_ranking_skill");

    const exp = await runCli<{ tagId: string; kind: string }>(
      [
        "tag", "add",
        "--code", "zero_to_one_exp",
        "--name", "0到1经验",
        "--mode", "assertion",
        "--kind", "experience",
        "--description", "主导过一个业务从 0 到 1 搭建。",
      ],
      { dbUrl: lease.dbUrl },
    );
    expect(exp.envelope.ok).toBe(true);
    expect(exp.envelope.status).toBe("created");
    expect(exp.envelope.data.kind).toBe("experience");
  });

  test("assertion 标签:缺 --kind 报错", async () => {
    const res = await runCli(
      [
        "tag", "add",
        "--code", "no_kind_tag",
        "--name", "无kind",
        "--mode", "assertion",
        "--description", "缺 kind 应当被拒。",
      ],
      { dbUrl: lease.dbUrl },
    );
    expect(res.envelope.ok).toBe(false);
    expect(res.envelope.status).toBe("usage_error");
    expect(res.exitCode).toBe(1);
  });

  test("assertion 标签:--kind 非法值(school)被拒", async () => {
    const res = await runCli(
      [
        "tag", "add",
        "--code", "bad_kind_tag",
        "--name", "非法kind",
        "--mode", "assertion",
        "--kind", "school",
        "--description", "assertion 不接受 school 作 kind。",
      ],
      { dbUrl: lease.dbUrl },
    );
    expect(res.envelope.ok).toBe(false);
    expect(res.envelope.status).toBe("usage_error");
    expect(res.exitCode).toBe(1);
  });
});
