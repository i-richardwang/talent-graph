// Read-only company-domain entity quality audit.
// Run: bun --env-file=.env.local run tools/audit/company-entity-quality.mjs
// Mirrors the school-domain checks (dup entities / domain drift / parent hierarchy /
// normalization contract) onto the ~21k company entity universe. No writes.
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql, params) => (await pool.query(sql, params)).rows;
const section = (t) => console.log(`\n===== ${t} =====`);

try {
  // 1. Scale & alias distribution -------------------------------------------
  section("1. 规模");
  const [counts] = await q(`
    SELECT
      (SELECT count(*) FROM entities WHERE entity_type='company') AS entities,
      (SELECT count(*) FROM entity_aliases WHERE entity_type='company') AS aliases,
      (SELECT count(*) FROM entities WHERE entity_type='company' AND parent_id IS NOT NULL) AS with_parent,
      (SELECT count(*) FROM entities WHERE entity_type='company' AND description IS NOT NULL AND btrim(description)<>'') AS with_desc`);
  console.table(counts);

  section("1b. 每实体别名数分布 (company)");
  const dist = await q(`
    WITH ac AS (
      SELECT e.id, count(a.id) AS n
      FROM entities e LEFT JOIN entity_aliases a ON a.entity_id=e.id
      WHERE e.entity_type='company' GROUP BY e.id)
    SELECT CASE WHEN n=0 THEN '0' WHEN n=1 THEN '1' WHEN n BETWEEN 2 AND 3 THEN '2-3'
                WHEN n BETWEEN 4 AND 9 THEN '4-9' ELSE '10+' END AS bucket,
           count(*) AS entities
    FROM ac GROUP BY 1 ORDER BY min(n)`);
  console.table(dist);

  // 2. Placeholder / garbage entities ---------------------------------------
  section("2. 占位/垃圾实体 (canonical_name)");
  const garbage = await q(`
    SELECT canonical_name, count(*) AS rows
    FROM entities WHERE entity_type='company'
      AND (canonical_name ~ '无法识别|无效|未知|unknown|n/?a|null|test|测试|^[\\s　]*$|^[-—_]+$|^[0-9]+$'
           OR char_length(btrim(canonical_name))<=1)
    GROUP BY 1 ORDER BY rows DESC, 1 LIMIT 40`);
  console.log(`命中 ${garbage.length} 种 (top 40):`);
  console.table(garbage);

  // 3a. Duplicate: same canonical_name as multiple company entity rows -------
  section("3a. 重复实体 — 同 canonical_name 多行");
  const dupName = await q(`
    SELECT canonical_name, count(*) AS rows, array_agg(id::text) AS ids
    FROM entities WHERE entity_type='company'
    GROUP BY 1 HAVING count(*)>1 ORDER BY rows DESC, 1 LIMIT 40`);
  console.log(`${dupName.length} 个重名 canonical (top 40):`);
  console.table(dupName.map(r => ({ canonical_name: r.canonical_name, rows: r.rows })));

  // 3b. Duplicate: X.canonical_name == some alias.raw_name of another entity -
  section("3b. 重复实体 — 交叉引用 (X.canonical = 别处 alias.raw)");
  const dupXref = await q(`
    SELECT x.canonical_name AS x_canonical, a.raw_name AS dup_raw,
           x.id::text AS x_id, a.entity_id::text AS owner_id
    FROM entities x
    JOIN entity_aliases a
      ON a.entity_type='company' AND a.raw_name=x.canonical_name AND a.entity_id<>x.id
    WHERE x.entity_type='company'
    ORDER BY 1 LIMIT 60`);
  console.log(`${dupXref.length} 条交叉引用候选 (top 60):`);
  console.table(dupXref.map(r => ({ x_canonical: r.x_canonical, dup_raw: r.dup_raw })));

  // 4. Domain drift: school/people-shaped names parked in company -----------
  section("4. 域漂移 — 学校样名字混进 company entity");
  const drift = await q(`
    SELECT canonical_name FROM entities WHERE entity_type='company'
      AND canonical_name ~ '大学|学院|中学|小学|幼儿园|附中|附小|高级中学|职业技术学院|大學|學院'
      AND canonical_name !~ '科技|管理|咨询|顾问|教育科技|集团|有限|股份'
    ORDER BY 1 LIMIT 60`);
  console.log(`${drift.length} 个学校样 company 实体 (top 60，已粗排除"科技/咨询/集团"等公司化后缀):`);
  console.table(drift);

  section("4b. 域漂移 — company alias 的 raw 只在教育表出现、从不在任职表");
  const eduOnly = await q(`
    SELECT a.raw_name, a.entity_id::text AS entity_id
    FROM entity_aliases a
    WHERE a.entity_type='company'
      AND EXISTS (SELECT 1 FROM employee_educations ed WHERE ed.school=a.raw_name)
      AND NOT EXISTS (SELECT 1 FROM employee_work_experiences w WHERE w.company_name=a.raw_name)
    ORDER BY 1 LIMIT 60`);
  console.log(`${eduOnly.length} 条 (top 60，纯教育出处=疑似该归 school 域):`);
  console.table(eduOnly);

  // 5. parent_id hierarchy integrity ----------------------------------------
  section("5. parent_id 完整性");
  const selfRef = await q(`SELECT count(*) AS n FROM entities WHERE id=parent_id`);
  const dangling = await q(`
    SELECT count(*) AS n FROM entities c
    WHERE c.parent_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM entities p WHERE p.id=c.parent_id)`);
  const crossType = await q(`
    SELECT c.canonical_name AS child, c.entity_type AS child_type,
           p.canonical_name AS parent, p.entity_type AS parent_type
    FROM entities c JOIN entities p ON p.id=c.parent_id
    WHERE c.entity_type<>p.entity_type LIMIT 40`);
  console.log(`自引用: ${selfRef[0].n}　悬空 parent 指针: ${dangling[0].n}　跨域父子: ${crossType.length}`);
  if (crossType.length) console.table(crossType);

  // 6. Normalization contract violations ------------------------------------
  section("6. 归一化违约 (首尾空白/NBSP/全角空格/零宽字符)");
  const normViol = await q(`
    SELECT 'alias' AS tbl, raw_name AS val FROM entity_aliases
      WHERE entity_type='company' AND raw_name ~ '^[\\s　\\u00a0\\u200b-\\u200d\\ufeff]|[\\s　\\u00a0\\u200b-\\u200d\\ufeff]$'
    UNION ALL
    SELECT 'entity', canonical_name FROM entities
      WHERE entity_type='company' AND canonical_name ~ '^[\\s　\\u00a0\\u200b-\\u200d\\ufeff]|[\\s　\\u00a0\\u200b-\\u200d\\ufeff]$'
    LIMIT 60`);
  console.log(`${normViol.length} 条首尾含不可见字符 (入库本应被 normalizeName 剥掉) (top 60):`);
  console.table(normViol.map(r => ({ tbl: r.tbl, quoted: JSON.stringify(r.val) })));

  // 7. Alias referential integrity ------------------------------------------
  section("7. 别名引用完整性");
  const orphanAlias = await q(`
    SELECT count(*) AS n FROM entity_aliases a
    WHERE NOT EXISTS (SELECT 1 FROM entities e WHERE e.id=a.entity_id)`);
  const typeMismatch = await q(`
    SELECT count(*) AS n FROM entity_aliases a
    JOIN entities e ON e.id=a.entity_id WHERE a.entity_type<>e.entity_type`);
  console.log(`悬空别名(指向不存在实体): ${orphanAlias[0].n}　类型错配(alias.type<>entity.type): ${typeMismatch[0].n}`);
} finally {
  await pool.end();
}
