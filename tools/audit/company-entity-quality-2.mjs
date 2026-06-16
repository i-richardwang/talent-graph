// Read-only follow-up: refine the real signals from pass 1.
// Run: bun --env-file=.env.local run tools/audit/company-entity-quality-2.mjs
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql, p) => (await pool.query(sql, p)).rows;
const section = (t) => console.log(`\n===== ${t} =====`);

try {
  // 2'. Precise garbage: Chinese placeholders + truly degenerate -----------
  section("2'. 精确占位/垃圾 (中文占位串 + 真退化名)");
  const garbage = await q(`
    SELECT canonical_name, count(*) AS rows FROM entities WHERE entity_type='company'
      AND (canonical_name ~ '无法识别|无效输入|未知|未填|暂无|保密|不详|^待补|^无$|^空$|^—+$|^-+$|^\\.+$|^、+$'
           OR char_length(btrim(canonical_name))=0)
    GROUP BY 1 ORDER BY rows DESC, 1 LIMIT 50`);
  console.log(`命中 ${garbage.length} 种:`);
  console.table(garbage);

  // 4'. School-shaped company entities — work vs edu disposition ------------
  section("4'. 学校样 company 实体分诊 (按其别名在任职/教育表的出处)");
  const schoolShaped = await q(`
    WITH ss AS (
      SELECT id, canonical_name FROM entities WHERE entity_type='company'
        AND canonical_name ~ '大学|学院|中学|小学|幼儿园|附中|附小|高级中学|大學|學院')
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE work_n>0)                       AS has_work,          -- legit employer
      count(*) FILTER (WHERE work_n=0 AND edu_n>0)           AS edu_only,          -- pure education = drift
      count(*) FILTER (WHERE work_n=0 AND edu_n=0)           AS neither            -- never observed either side
    FROM (
      SELECT ss.id,
        (SELECT count(*) FROM entity_aliases a JOIN employee_work_experiences w ON w.company_name=a.raw_name
           WHERE a.entity_id=ss.id AND a.entity_type='company') AS work_n,
        (SELECT count(*) FROM entity_aliases a JOIN employee_educations ed ON ed.school=a.raw_name
           WHERE a.entity_id=ss.id AND a.entity_type='company') AS edu_n
      FROM ss) t`);
  console.table(schoolShaped);

  section("4''. 纯教育出处的学校样 company 实体 (drift 嫌疑，逐个列)");
  const driftList = await q(`
    WITH ss AS (
      SELECT id, canonical_name FROM entities WHERE entity_type='company'
        AND canonical_name ~ '大学|学院|中学|小学|幼儿园|附中|附小|高级中学|大學|學院')
    SELECT ss.canonical_name,
      (SELECT count(*) FROM entity_aliases a JOIN employee_work_experiences w ON w.company_name=a.raw_name
         WHERE a.entity_id=ss.id AND a.entity_type='company') AS work_n,
      (SELECT count(*) FROM entity_aliases a JOIN employee_educations ed ON ed.school=a.raw_name
         WHERE a.entity_id=ss.id AND a.entity_type='company') AS edu_n
    FROM ss
    WHERE (SELECT count(*) FROM entity_aliases a JOIN employee_work_experiences w ON w.company_name=a.raw_name
             WHERE a.entity_id=ss.id AND a.entity_type='company')=0
    ORDER BY edu_n DESC, 1 LIMIT 80`);
  console.log(`${driftList.length} 个无任职出处 (top 80):`);
  console.table(driftList);

  // 3b'. Classify the 20 cross-ref candidates: parent-child vs split-brain --
  section("3b'. 交叉引用候选分类 (合法母子 vs 真裂脑)");
  const xref = await q(`
    SELECT x.canonical_name,
           x.id::text AS x_id, a.entity_id::text AS owner_id,
           o.canonical_name AS owner_canonical,
           (x.parent_id = a.entity_id) AS x_child_of_owner,
           (o.parent_id = x.id)        AS owner_child_of_x,
           (SELECT count(*) FROM entity_aliases aa WHERE aa.entity_id=x.id) AS x_alias_n,
           (SELECT count(*) FROM tag_entity_map tm WHERE tm.entity_id=x.id)  AS x_tag_n,
           (SELECT count(*) FROM tag_entity_map tm WHERE tm.entity_id=a.entity_id) AS owner_tag_n
    FROM entities x
    JOIN entity_aliases a ON a.entity_type='company' AND a.raw_name=x.canonical_name AND a.entity_id<>x.id
    JOIN entities o ON o.id=a.entity_id
    WHERE x.entity_type='company'
    ORDER BY 1`);
  console.table(xref.map(r => ({
    name: r.canonical_name, owner: r.owner_canonical,
    rel: r.x_child_of_owner ? 'x是owner子' : r.owner_child_of_x ? 'owner是x子' : '无母子关系',
    x_aliases: r.x_alias_n, x_tags: r.x_tag_n, owner_tags: r.owner_tag_n })));
} finally { await pool.end(); }
