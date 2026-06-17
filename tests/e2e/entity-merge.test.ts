// entity merge / set-parent 的端到端闭环。
// merge:同一家公司被存成两个实体(裂脑)→ 合并成一个,别名/标签/子实体收敛、loser 删。
// set-parent:给已存在实体设/改/清 parent_id,带同域 + 防环校验。

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

// 每个 test 都 spawn 多条 CLI 子进程(各自冷启动 bun + 连 PG),5s 默认超时偏紧——
// merge happy / set-parent 幂等这类 spawn 最密的用例会偶发越界。放宽到 30s。
setDefaultTimeout(30_000);
import { truncateAll } from "../helpers/reset";
import { runCli } from "../helpers/cli";
import { makeTag, makeEntity, makeAlias, linkTag } from "../helpers/fixtures";

interface EntityGet {
  entityId: string;
  canonicalName: string;
  parentId: string | null;
  aliases: { rawName: string; reasoning: string | null }[];
  children: { entityId: string; canonicalName: string }[];
  tags: { tagCode: string; matchMode: string }[];
}

const getEntity = (dbUrl: string, id: string) =>
  runCli<EntityGet>(["entity", "get", id], { dbUrl });

describe("entity merge", () => {
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

  test("happy: 别名/标签/子实体全收敛到 survivor,loser 删,审计落 1 条", async () => {
    await makeTag({
      dbUrl: lease.dbUrl,
      code: "ind_x",
      name: "行业X",
      mode: "list",
      kind: "company",
      description: "测试用 list 标签",
    });
    const surv = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "高德",
    });
    const loser = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "高德地图",
    });
    await makeAlias({
      dbUrl: lease.dbUrl,
      type: "company",
      rawName: "AutoNavi",
      entity: loser.entityId,
    });
    await linkTag({ dbUrl: lease.dbUrl, tag: "ind_x", entity: loser.entityId });
    const child = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "高德地图子公司",
      parent: loser.entityId,
    });

    const res = await runCli<{
      removed: { entityId: string };
      migrated: { aliases: number; tagLinks: number; children: number };
      deduped: { aliases: number; tagLinks: number };
    }>(
      ["entity", "merge", "--from", loser.entityId, "--into", surv.entityId],
      { dbUrl: lease.dbUrl },
    );
    expect(res.envelope.ok).toBe(true);
    expect(res.envelope.status).toBe("merged");
    expect(res.envelope.data.migrated.aliases).toBe(1); // AutoNavi
    expect(res.envelope.data.migrated.tagLinks).toBe(1);
    expect(res.envelope.data.migrated.children).toBe(1);

    // loser 已删
    const goneLoser = await getEntity(lease.dbUrl, loser.entityId);
    expect(goneLoser.envelope.ok).toBe(false);
    expect(goneLoser.envelope.status).toBe("entity_not_found");

    // survivor 收齐:AutoNavi(改指) + 高德地图(loser 名登记成别名)
    const survAfter = await getEntity(lease.dbUrl, surv.entityId);
    const raws = survAfter.envelope.data.aliases.map((a) => a.rawName).sort();
    expect(raws).toContain("AutoNavi");
    expect(raws).toContain("高德地图");
    // 标签迁到 survivor
    expect(survAfter.envelope.data.tags.map((t) => t.tagCode)).toContain("ind_x");
    // 子实体改挂 survivor
    expect(survAfter.envelope.data.children.map((c) => c.entityId)).toContain(
      child.entityId,
    );

    // 审计:loser 全貌一条复合快照
    const audit = await runCli<{ tableName: string }[]>(
      ["audit", "list", "--limit", "20"],
      { dbUrl: lease.dbUrl },
    );
    expect(
      audit.envelope.data.filter((a) => a.tableName === "entities").length,
    ).toBeGreaterThanOrEqual(1);
  });

  test("去重:survivor 已有同名别名 / 同 tag → 计入 deduped 不重复", async () => {
    await makeTag({
      dbUrl: lease.dbUrl,
      code: "ind_y",
      name: "行业Y",
      mode: "list",
      kind: "company",
      description: "测试用 list 标签",
    });
    const surv = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "虹软",
    });
    const loser = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "ArcSoft",
    });
    // 两边都有别名 "虹软科技" + 都挂 ind_y → 应去重
    await makeAlias({
      dbUrl: lease.dbUrl,
      type: "company",
      rawName: "虹软科技",
      entity: surv.entityId,
    });
    await makeAlias({
      dbUrl: lease.dbUrl,
      type: "company",
      rawName: "虹软科技2",
      entity: loser.entityId,
    });
    // loser 也想登记 "虹软科技"——但 UNIQUE 已被 survivor 占,故 loser 只有 虹软科技2
    await linkTag({ dbUrl: lease.dbUrl, tag: "ind_y", entity: surv.entityId });
    await linkTag({ dbUrl: lease.dbUrl, tag: "ind_y", entity: loser.entityId });

    const res = await runCli<{
      migrated: { aliases: number; tagLinks: number };
      deduped: { aliases: number; tagLinks: number };
    }>(
      ["entity", "merge", "--from", loser.entityId, "--into", surv.entityId],
      { dbUrl: lease.dbUrl },
    );
    expect(res.envelope.status).toBe("merged");
    expect(res.envelope.data.migrated.tagLinks).toBe(0);
    expect(res.envelope.data.deduped.tagLinks).toBe(1);
    expect(res.envelope.data.migrated.aliases).toBe(1); // 虹软科技2

    const survAfter = await getEntity(lease.dbUrl, surv.entityId);
    const raws = survAfter.envelope.data.aliases.map((a) => a.rawName).sort();
    // 虹软科技 仅一条(去重),虹软科技2 改指过来,ArcSoft 名登记
    expect(raws.filter((r) => r === "虹软科技")).toHaveLength(1);
    expect(raws).toContain("虹软科技2");
    expect(raws).toContain("ArcSoft");
    expect(survAfter.envelope.data.tags).toHaveLength(1);
  });

  test("--dry-run:报告非空但库零变化", async () => {
    const surv = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "京东科技",
    });
    const loser = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "京东金融",
    });
    await makeAlias({
      dbUrl: lease.dbUrl,
      type: "company",
      rawName: "京东数科",
      entity: loser.entityId,
    });

    const res = await runCli<{ plan: { aliasesMoved: number } }>(
      [
        "entity", "merge",
        "--from", loser.entityId,
        "--into", surv.entityId,
        "--dry-run",
      ],
      { dbUrl: lease.dbUrl },
    );
    expect(res.envelope.ok).toBe(true);
    expect(res.envelope.status).toBe("dry_run");
    expect(res.envelope.data.plan.aliasesMoved).toBe(1);

    // 库未变:loser 仍在,其别名仍挂 loser
    const stillLoser = await getEntity(lease.dbUrl, loser.entityId);
    expect(stillLoser.envelope.ok).toBe(true);
    expect(stillLoser.envelope.data.aliases.map((a) => a.rawName)).toContain(
      "京东数科",
    );
    const survAfter = await getEntity(lease.dbUrl, surv.entityId);
    expect(survAfter.envelope.data.aliases).toHaveLength(0);
  });

  test("护栏:from===into → usage_error", async () => {
    const e = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "甲",
    });
    const res = await runCli(
      ["entity", "merge", "--from", e.entityId, "--into", e.entityId],
      { dbUrl: lease.dbUrl },
    );
    expect(res.envelope.ok).toBe(false);
    expect(res.envelope.status).toBe("usage_error");
  });

  test("护栏:跨 entity_type → cross_domain_rejected", async () => {
    const co = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "清华控股",
    });
    const sch = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "school",
      canonicalName: "清华大学",
    });
    const res = await runCli(
      ["entity", "merge", "--from", sch.entityId, "--into", co.entityId],
      { dbUrl: lease.dbUrl },
    );
    expect(res.envelope.ok).toBe(false);
    expect(res.envelope.status).toBe("cross_domain_rejected");
  });

  test("护栏:into 不存在 → entity_not_found;from 不存在 → already_absent", async () => {
    const e = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "乙",
    });
    const ghost = "00000000-0000-4000-8000-000000000000";
    const intoMiss = await runCli(
      ["entity", "merge", "--from", e.entityId, "--into", ghost],
      { dbUrl: lease.dbUrl },
    );
    expect(intoMiss.envelope.status).toBe("entity_not_found");

    const fromMiss = await runCli(
      ["entity", "merge", "--from", ghost, "--into", e.entityId],
      { dbUrl: lease.dbUrl },
    );
    expect(fromMiss.envelope.ok).toBe(true);
    expect(fromMiss.envelope.status).toBe("already_absent");
  });

  test("loser 标准名被第三方实体占用:跳过登记,merge 不崩(不偷别名)", async () => {
    const surv = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "苹果",
    });
    const loser = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "苹果中国",
    });
    const third = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "第三方",
    });
    // 第三方实体占着 "苹果中国" 这个写法
    await makeAlias({
      dbUrl: lease.dbUrl,
      type: "company",
      rawName: "苹果中国",
      entity: third.entityId,
    });

    const res = await runCli(
      ["entity", "merge", "--from", loser.entityId, "--into", surv.entityId],
      { dbUrl: lease.dbUrl },
    );
    expect(res.envelope.ok).toBe(true);
    expect(res.envelope.status).toBe("merged");
    // survivor 不该拿到 "苹果中国"(被第三方占着,不偷)
    const survAfter = await getEntity(lease.dbUrl, surv.entityId);
    expect(survAfter.envelope.data.aliases.map((a) => a.rawName)).not.toContain(
      "苹果中国",
    );
    // 第三方的别名原封不动
    const thirdAfter = await getEntity(lease.dbUrl, third.entityId);
    expect(thirdAfter.envelope.data.aliases.map((a) => a.rawName)).toContain(
      "苹果中国",
    );
  });

  test("护栏:把祖先并入深层后代(L→M→S, from=L into=S)→ merge_would_cycle", async () => {
    const l = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "L祖",
    });
    const m = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "M中",
      parent: l.entityId,
    });
    const s = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "S孙",
      parent: m.entityId,
    });
    const res = await runCli(
      ["entity", "merge", "--from", l.entityId, "--into", s.entityId],
      { dbUrl: lease.dbUrl },
    );
    expect(res.envelope.ok).toBe(false);
    expect(res.envelope.status).toBe("merge_would_cycle");
    // 未写库:L 仍在
    const stillL = await getEntity(lease.dbUrl, l.entityId);
    expect(stillL.envelope.ok).toBe(true);
  });

  test("survivor 以 loser 为父:merge 后 survivor 改挂 loser 的父", async () => {
    const grand = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "祖",
    });
    const loser = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "父loser",
      parent: grand.entityId,
    });
    const surv = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "子survivor",
      parent: loser.entityId,
    });
    const res = await runCli(
      ["entity", "merge", "--from", loser.entityId, "--into", surv.entityId],
      { dbUrl: lease.dbUrl },
    );
    expect(res.envelope.status).toBe("merged");
    const survAfter = await getEntity(lease.dbUrl, surv.entityId);
    // survivor.parent 原本是 loser → 改成 loser 的父(grand)
    expect(survAfter.envelope.data.parentId).toBe(grand.entityId);
  });
});

describe("entity set-parent", () => {
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

  test("happy:同域设父成功", async () => {
    const parent = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "神龙汽车",
    });
    const child = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "东风标致",
    });
    const res = await runCli(
      [
        "entity", "set-parent",
        "--entity", child.entityId,
        "--parent", parent.entityId,
      ],
      { dbUrl: lease.dbUrl },
    );
    expect(res.envelope.status).toBe("set");
    const after = await getEntity(lease.dbUrl, child.entityId);
    expect(after.envelope.data.parentId).toBe(parent.entityId);
  });

  test("跨域拦截 + 自环拦截", async () => {
    const co = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "某公司",
    });
    const sch = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "school",
      canonicalName: "某大学",
    });
    const cross = await runCli(
      ["entity", "set-parent", "--entity", co.entityId, "--parent", sch.entityId],
      { dbUrl: lease.dbUrl },
    );
    expect(cross.envelope.status).toBe("cross_domain_rejected");

    const selfp = await runCli(
      ["entity", "set-parent", "--entity", co.entityId, "--parent", co.entityId],
      { dbUrl: lease.dbUrl },
    );
    expect(selfp.envelope.status).toBe("usage_error");
  });

  test("防环:把后代设为父 → cycle_rejected", async () => {
    const a = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "A",
    });
    const b = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "B",
      parent: a.entityId,
    });
    // B 是 A 的子;现在想把 A 的父设成 B → 成环
    const res = await runCli(
      ["entity", "set-parent", "--entity", a.entityId, "--parent", b.entityId],
      { dbUrl: lease.dbUrl },
    );
    expect(res.envelope.ok).toBe(false);
    expect(res.envelope.status).toBe("cycle_rejected");
  });

  test("幂等 already_set + --clear + already_cleared", async () => {
    const parent = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "P",
    });
    const child = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "C",
      parent: parent.entityId,
    });
    const again = await runCli(
      [
        "entity", "set-parent",
        "--entity", child.entityId,
        "--parent", parent.entityId,
      ],
      { dbUrl: lease.dbUrl },
    );
    expect(again.envelope.status).toBe("already_set");

    const cleared = await runCli(
      ["entity", "set-parent", "--entity", child.entityId, "--clear"],
      { dbUrl: lease.dbUrl },
    );
    expect(cleared.envelope.status).toBe("cleared");
    const after = await getEntity(lease.dbUrl, child.entityId);
    expect(after.envelope.data.parentId).toBeNull();

    const clearedAgain = await runCli(
      ["entity", "set-parent", "--entity", child.entityId, "--clear"],
      { dbUrl: lease.dbUrl },
    );
    expect(clearedAgain.envelope.status).toBe("already_cleared");
  });
});

describe("entity rename", () => {
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

  test("happy:canonical 改名,getEntity 反映新名,审计落 1 条", async () => {
    const e = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "华凌集团",
    });
    const res = await runCli<{ canonicalName: string }>(
      ["entity", "rename", "--entity", e.entityId, "--canonical-name", "华凌(新疆)"],
      { dbUrl: lease.dbUrl },
    );
    expect(res.envelope.ok).toBe(true);
    expect(res.envelope.status).toBe("renamed");
    expect(res.envelope.data.canonicalName).toBe("华凌(新疆)");

    const after = await getEntity(lease.dbUrl, e.entityId);
    expect(after.envelope.data.canonicalName).toBe("华凌(新疆)");

    const audit = await runCli<{ tableName: string }[]>(
      ["audit", "list", "--limit", "20"],
      { dbUrl: lease.dbUrl },
    );
    expect(
      audit.envelope.data.filter((a) => a.tableName === "entities").length,
    ).toBeGreaterThanOrEqual(1);
  });

  test("幂等:改成同名 → already_named,不写审计", async () => {
    const e = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "万得",
    });
    const res = await runCli(
      ["entity", "rename", "--entity", e.entityId, "--canonical-name", "万得"],
      { dbUrl: lease.dbUrl },
    );
    expect(res.envelope.ok).toBe(true);
    expect(res.envelope.status).toBe("already_named");
    const audit = await runCli<{ tableName: string }[]>(
      ["audit", "list", "--limit", "20"],
      { dbUrl: lease.dbUrl },
    );
    expect(
      audit.envelope.data.filter((a) => a.tableName === "entities").length,
    ).toBe(0);
  });

  test("护栏:同域已有该 canonical → name_taken,库不变", async () => {
    const a = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "京东科技",
    });
    const b = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "京东金融",
    });
    const res = await runCli(
      ["entity", "rename", "--entity", b.entityId, "--canonical-name", "京东科技"],
      { dbUrl: lease.dbUrl },
    );
    expect(res.envelope.ok).toBe(false);
    expect(res.envelope.status).toBe("name_taken");
    // b 没被改
    const after = await getEntity(lease.dbUrl, b.entityId);
    expect(after.envelope.data.canonicalName).toBe("京东金融");
    void a;
  });

  test("跨 entity_type 同名不冲突:company 可改成 school 已用的名", async () => {
    await makeEntity({
      dbUrl: lease.dbUrl,
      type: "school",
      canonicalName: "清华",
    });
    const co = await makeEntity({
      dbUrl: lease.dbUrl,
      type: "company",
      canonicalName: "清华系企业",
    });
    const res = await runCli<{ canonicalName: string }>(
      ["entity", "rename", "--entity", co.entityId, "--canonical-name", "清华"],
      { dbUrl: lease.dbUrl },
    );
    expect(res.envelope.ok).toBe(true);
    expect(res.envelope.status).toBe("renamed");
  });

  test("护栏:实体不存在 → entity_not_found;非 UUID → usage_error", async () => {
    const ghost = "00000000-0000-4000-8000-000000000000";
    const miss = await runCli(
      ["entity", "rename", "--entity", ghost, "--canonical-name", "随便"],
      { dbUrl: lease.dbUrl },
    );
    expect(miss.envelope.status).toBe("entity_not_found");

    const bad = await runCli(
      ["entity", "rename", "--entity", "not-a-uuid", "--canonical-name", "随便"],
      { dbUrl: lease.dbUrl },
    );
    expect(bad.envelope.ok).toBe(false);
    expect(bad.envelope.status).toBe("usage_error");
  });
});
