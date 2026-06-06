// 判定标签的 confidence 三态闭环:命中写 confident、边界模糊写 borderline、
// 非法值拦截、幂等不覆盖,以及读侧默认只返 confident + borderline/all 过滤。
// 覆盖 employee.tag-add(--confidence)/ tag.members(--confidence)/ tag.get / employee.get。

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { Client } from "pg";
import { acquire, type Lease } from "../helpers/pool";
import { truncateAll } from "../helpers/reset";
import { runCli } from "../helpers/cli";
import { makeTag } from "../helpers/fixtures";

// 员工数据无 CLI 写入命令(CLI 对 employee 只读),测试直接 INSERT。
async function seedEmployees(dbUrl: string): Promise<void> {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO employees (emp_id, name) VALUES ($1,$2),($3,$4)
       ON CONFLICT (emp_id) DO NOTHING`,
      ["EMP_CONF", "测试员工A", "EMP_BORDER", "测试员工B"],
    );
  } finally {
    await client.end();
  }
}

interface AssertionMember {
  empId: string;
  name: string;
  confidence: "confident" | "borderline";
  reasoning: string | null;
}

describe("assertion-tag confidence", () => {
  let lease: Lease;

  beforeAll(async () => {
    lease = await acquire();
  });

  afterAll(async () => {
    await lease.release();
  });

  beforeEach(async () => {
    await truncateAll(lease.dbUrl);
    await seedEmployees(lease.dbUrl);
  });

  test("confident / borderline 写入,非法值拦截,幂等不覆盖", async () => {
    const { tagCode } = await makeTag({
      dbUrl: lease.dbUrl,
      code: "causal",
      name: "因果分析",
      mode: "assertion",
      kind: "skill",
      description: "做过因果识别 / 反事实建模",
    });

    // 命中 → confident
    const conf = await runCli<{ confidence: string }>(
      ["employee", "tag-add", "--emp", "EMP_CONF", "--tag", tagCode,
        "--confidence", "confident", "--reasoning", "DID 因果识别"],
      { dbUrl: lease.dbUrl },
    );
    expect(conf.envelope.status).toBe("linked");
    expect(conf.envelope.data.confidence).toBe("confident");

    // 边界模糊 → borderline
    const border = await runCli<{ confidence: string }>(
      ["employee", "tag-add", "--emp", "EMP_BORDER", "--tag", tagCode,
        "--confidence", "borderline", "--reasoning", "边界:相关性回归算不算因果"],
      { dbUrl: lease.dbUrl },
    );
    expect(border.envelope.status).toBe("linked");
    expect(border.envelope.data.confidence).toBe("borderline");

    // 非法 confidence → 拦截,不写
    const bad = await runCli(
      ["employee", "tag-add", "--emp", "EMP_CONF", "--tag", tagCode,
        "--confidence", "maybe"],
      { dbUrl: lease.dbUrl },
    );
    expect(bad.envelope.ok).toBe(false);
    expect(bad.envelope.status).toBe("invalid_confidence");

    // 幂等:已挂的再 add(默认 confident)→ already_linked,返既有值不覆盖
    const again = await runCli<{ confidence: string }>(
      ["employee", "tag-add", "--emp", "EMP_BORDER", "--tag", tagCode],
      { dbUrl: lease.dbUrl },
    );
    expect(again.envelope.status).toBe("already_linked");
    expect(again.envelope.data.confidence).toBe("borderline");
  }, 30000);

  test("不传 --confidence 默认 confident", async () => {
    const { tagCode } = await makeTag({
      dbUrl: lease.dbUrl,
      code: "reco",
      name: "推荐排序",
      mode: "assertion",
      kind: "skill",
      description: "做过召回 / 排序建模",
    });
    const res = await runCli<{ confidence: string }>(
      ["employee", "tag-add", "--emp", "EMP_CONF", "--tag", tagCode],
      { dbUrl: lease.dbUrl },
    );
    expect(res.envelope.data.confidence).toBe("confident");
  }, 30000);

  test("读侧:members 默认只 confident,borderline/all 过滤;get 分计数;employee get 带 confidence", async () => {
    const { tagCode } = await makeTag({
      dbUrl: lease.dbUrl,
      code: "causal",
      name: "因果分析",
      mode: "assertion",
      kind: "skill",
      description: "做过因果识别",
    });
    await runCli(
      ["employee", "tag-add", "--emp", "EMP_CONF", "--tag", tagCode,
        "--confidence", "confident", "--reasoning", "DID"],
      { dbUrl: lease.dbUrl },
    );
    await runCli(
      ["employee", "tag-add", "--emp", "EMP_BORDER", "--tag", tagCode,
        "--confidence", "borderline", "--reasoning", "边界"],
      { dbUrl: lease.dbUrl },
    );

    // members 默认 → 只 confident
    const def = await runCli<{
      confidenceFilter: string;
      members: AssertionMember[];
    }>(["tag", "members", tagCode], { dbUrl: lease.dbUrl });
    expect(def.envelope.data.confidenceFilter).toBe("confident");
    expect(def.envelope.data.members.map((m) => m.empId)).toEqual(["EMP_CONF"]);
    expect(def.envelope.data.members[0].confidence).toBe("confident");

    // members --confidence borderline → 只 borderline
    const bl = await runCli<{ members: AssertionMember[] }>(
      ["tag", "members", tagCode, "--confidence", "borderline"],
      { dbUrl: lease.dbUrl },
    );
    expect(bl.envelope.data.members.map((m) => m.empId)).toEqual(["EMP_BORDER"]);

    // members --confidence all → 两者都有
    const all = await runCli<{ members: AssertionMember[] }>(
      ["tag", "members", tagCode, "--confidence", "all"],
      { dbUrl: lease.dbUrl },
    );
    expect(all.envelope.data.members.map((m) => m.empId).sort()).toEqual([
      "EMP_BORDER",
      "EMP_CONF",
    ]);

    // tag get → memberCount 只数 confident,borderlineCount 单列
    const get = await runCli<{ memberCount: number; borderlineCount: number }>(
      ["tag", "get", tagCode],
      { dbUrl: lease.dbUrl },
    );
    expect(get.envelope.data.memberCount).toBe(1);
    expect(get.envelope.data.borderlineCount).toBe(1);

    // employee get tags[] → 含 borderline,带 confidence
    const emp = await runCli<{
      tags: { tagCode: string; confidence: string }[];
    }>(["employee", "get", "EMP_BORDER"], { dbUrl: lease.dbUrl });
    const tag = emp.envelope.data.tags.find((t) => t.tagCode === "causal");
    expect(tag?.confidence).toBe("borderline");
  }, 30000);
});
