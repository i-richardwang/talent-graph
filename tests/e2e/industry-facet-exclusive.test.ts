// industry facet 互斥:每个实体只保留一个主营行业桶。
// 覆盖 tag link 的新守卫——同实体挂第二个不同 industry 桶默认被拒
// (industry_already_classified),--replace 才覆盖(旧桶进 audit_log);
// 同 tag 重挂仍幂等;非 industry facet(notable_employer)不受影响。

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  setDefaultTimeout,
} from "bun:test";
import { acquire, type Lease } from "../helpers/pool";
setDefaultTimeout(30_000);
import { truncateAll } from "../helpers/reset";
import { runCli } from "../helpers/cli";
import { makeTag, makeEntity } from "../helpers/fixtures";

interface EntityTag {
  tagCode: string;
  matchMode: string;
}
interface EntityGetResp {
  entityId: string;
  tags: EntityTag[];
}

async function industryTagsOf(dbUrl: string, entityId: string): Promise<string[]> {
  const res = await runCli<EntityGetResp>(["entity", "get", entityId], { dbUrl });
  expect(res.envelope.ok).toBe(true);
  return res.envelope.data.tags
    .map((t) => t.tagCode)
    .filter((c) => c.startsWith("ind_"))
    .sort();
}

describe("industry facet exclusivity on tag link", () => {
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

  test("second different industry bucket rejected; --replace overwrites; same tag idempotent; non-industry coexists", async () => {
    const dbUrl = lease.dbUrl;

    // 两个 industry 桶 + 一个 notable_employer 桶(同 kind=company,facet 不同)
    const indA = await makeTag({
      dbUrl, code: "ind_a", name: "行业A", mode: "list", kind: "company",
      facet: "industry", description: "industry bucket A",
    });
    const indB = await makeTag({
      dbUrl, code: "ind_b", name: "行业B", mode: "list", kind: "company",
      facet: "industry", description: "industry bucket B",
    });
    await makeTag({
      dbUrl, code: "mbb", name: "MBB", mode: "list", kind: "company",
      facet: "notable_employer", description: "notable employer cluster",
    });

    const ent = await makeEntity({
      dbUrl, type: "company", canonicalName: "测试公司",
      description: "fixture", forceNew: true,
    });
    const eid = ent.entityId;

    // 1. 首个 industry 桶 → linked
    const link1 = await runCli(
      ["tag", "link", "--tag", "ind_a", "--entity", eid, "--match-mode", "exact"],
      { dbUrl },
    );
    expect(link1.envelope.ok).toBe(true);
    expect(link1.envelope.status).toBe("linked");

    // 2. 第二个不同 industry 桶,不带 --replace → 拒绝
    const link2 = await runCli<{ existing: { tagCode: string }[] }>(
      ["tag", "link", "--tag", "ind_b", "--entity", eid, "--match-mode", "exact"],
      { dbUrl },
    );
    expect(link2.envelope.ok).toBe(false);
    expect(link2.envelope.status).toBe("industry_already_classified");
    expect(link2.envelope.data.existing.map((e) => e.tagCode)).toContain("ind_a");
    // 状态未变:仍只有 ind_a
    expect(await industryTagsOf(dbUrl, eid)).toEqual(["ind_a"]);

    // 3. 同一个 tag(ind_a)重挂 → 幂等 already_linked,不报 conflict
    const reA = await runCli(
      ["tag", "link", "--tag", "ind_a", "--entity", eid, "--match-mode", "exact"],
      { dbUrl },
    );
    expect(reA.envelope.ok).toBe(true);
    expect(reA.envelope.status).toBe("already_linked");

    // 4. notable_employer 桶 → 共存,不被 industry 互斥拦
    const linkMbb = await runCli(
      ["tag", "link", "--tag", "mbb", "--entity", eid, "--match-mode", "exact"],
      { dbUrl },
    );
    expect(linkMbb.envelope.ok).toBe(true);
    expect(linkMbb.envelope.status).toBe("linked");

    // 5. 带 --replace 改判 → linked_replaced,旧 ind_a 被换成 ind_b
    const link3 = await runCli<{ replaced: { tagCode: string }[] }>(
      ["tag", "link", "--tag", "ind_b", "--entity", eid, "--match-mode", "exact", "--replace"],
      { dbUrl },
    );
    expect(link3.envelope.ok).toBe(true);
    expect(link3.envelope.status).toBe("linked_replaced");
    expect(link3.envelope.data.replaced.map((e) => e.tagCode)).toContain("ind_a");
    // 终态:industry 只剩 ind_b(ind_a 没了),mbb 仍在
    expect(await industryTagsOf(dbUrl, eid)).toEqual(["ind_b"]);

    // 6. 被换掉的 ind_a 进了 audit_log(可回滚)
    const audit = await runCli<{ tableName: string }[]>(
      ["audit", "list", "--entity", eid],
      { dbUrl },
    );
    expect(audit.envelope.ok).toBe(true);
    expect(
      audit.envelope.data.some((e) => e.tableName === "tag_entity_map"),
    ).toBe(true);

    expect(indA.tagCode).toBe("ind_a");
    expect(indB.tagCode).toBe("ind_b");
  });
});
