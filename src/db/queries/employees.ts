import { sql, eq, or, ilike, asc } from "drizzle-orm";
import { db } from "../index";
import {
  employees,
  employeeWorkExperiences,
  employeeEducations,
  employeeResumes,
  employeeTagMap,
  tags,
} from "../schema";

// 员工搜索 + 档案(Phase 3)。137k+ 员工,只支持搜索,不列全量。
// 档案除直接挂的判定标签外,还实时派生命中的名单标签(含命中路径)——
// 这是名单标签"下游 JOIN 派生"语义的可视化,逻辑与 CLAUDE.md 描述的链路一致。

export interface EmployeeSearchRow {
  empId: string;
  name: string;
  hrStatus: string | null;
}

export async function searchEmployees(
  q: string,
  limit = 30,
): Promise<EmployeeSearchRow[]> {
  const query = q.trim();
  if (!query) return [];
  return db
    .select({
      empId: employees.empId,
      name: employees.name,
      hrStatus: employees.hrStatus,
    })
    .from(employees)
    .where(
      or(ilike(employees.name, `%${query}%`), eq(employees.empId, query)),
    )
    .orderBy(asc(employees.name))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export interface DerivedTagPath {
  rawName: string; // 员工经历里的原始写法
  originName: string; // 命中的标准实体
  mountName: string; // tag 实际挂在哪个实体(可能是祖先)
  matchMode: string;
  direct: boolean; // tag 是否直接挂在命中实体上(否则经由祖先 subtree)
}

export interface DerivedTag {
  tagId: string;
  tagCode: string;
  tagName: string;
  kind: string;
  paths: DerivedTagPath[];
}

export interface EmployeeProfile {
  empId: string;
  name: string;
  hrStatus: string | null;
  workExperience: {
    id: number;
    companyName: string;
    positionTitle: string | null;
    startDate: string | null;
    endDate: string | null;
    country: string | null;
  }[];
  education: {
    id: number;
    school: string;
    major: string | null;
    degree: string | null;
    startDate: string | null;
    endDate: string | null;
  }[];
  assertionTags: {
    tagId: string;
    tagCode: string;
    tagName: string;
    confidence: string;
    reasoning: string | null;
  }[];
  derivedTags: DerivedTag[];
}

export async function getEmployeeProfile(
  empId: string,
): Promise<EmployeeProfile | null> {
  const [employee] = await db
    .select({
      empId: employees.empId,
      name: employees.name,
      hrStatus: employees.hrStatus,
    })
    .from(employees)
    .where(eq(employees.empId, empId))
    .limit(1);
  if (!employee) return null;

  const [workExperience, education, assertionTags, derivedRows] =
    await Promise.all([
      db
        .select({
          id: employeeWorkExperiences.id,
          companyName: employeeWorkExperiences.companyName,
          positionTitle: employeeWorkExperiences.positionTitle,
          startDate: employeeWorkExperiences.startDate,
          endDate: employeeWorkExperiences.endDate,
          country: employeeWorkExperiences.country,
        })
        .from(employeeWorkExperiences)
        .where(eq(employeeWorkExperiences.empId, empId))
        .orderBy(sql`${employeeWorkExperiences.startDate} DESC NULLS LAST`),
      db
        .select({
          id: employeeEducations.id,
          school: employeeEducations.school,
          major: employeeEducations.major,
          degree: employeeEducations.degree,
          startDate: employeeEducations.startDate,
          endDate: employeeEducations.endDate,
        })
        .from(employeeEducations)
        .where(eq(employeeEducations.empId, empId))
        .orderBy(sql`${employeeEducations.startDate} DESC NULLS LAST`),
      db
        .select({
          tagId: tags.id,
          tagCode: tags.tagCode,
          tagName: tags.tagName,
          confidence: employeeTagMap.confidence,
          reasoning: employeeTagMap.reasoning,
        })
        .from(employeeTagMap)
        .innerJoin(tags, eq(employeeTagMap.tagId, tags.id))
        .where(eq(employeeTagMap.empId, empId)),
      deriveListTags(empId),
    ]);

  return {
    ...employee,
    workExperience,
    education,
    assertionTags,
    derivedTags: derivedRows,
  };
}

// 派生名单标签:经历原始名 → entity_aliases(同 entity_type 精确等值)→ 实体 →
// 沿 parent_id 取祖先链 → tag_entity_map(exact 仅命中本体 / subtree 命中本体+后代)→ list tag。
async function deriveListTags(empId: string): Promise<DerivedTag[]> {
  const res = await db.execute(sql`
    WITH RECURSIVE
    signals AS (
      SELECT 'company'::text AS sig_type, we.company_name AS raw_name
      FROM employee_work_experiences we WHERE we.emp_id = ${empId}
      UNION
      SELECT 'school'::text, ed.school
      FROM employee_educations ed WHERE ed.emp_id = ${empId}
    ),
    matched AS (
      SELECT DISTINCT ent.id AS entity_id, ent.canonical_name AS origin_name, s.raw_name
      FROM signals s
      JOIN entity_aliases a ON a.entity_type = s.sig_type AND a.raw_name = s.raw_name
      JOIN entities ent ON ent.id = a.entity_id
    ),
    anc AS (
      SELECT m.origin_name, m.raw_name, m.entity_id AS node_id, 0 AS depth
      FROM matched m
      UNION ALL
      SELECT anc.origin_name, anc.raw_name, e.parent_id, anc.depth + 1
      FROM anc JOIN entities e ON e.id = anc.node_id WHERE e.parent_id IS NOT NULL
    )
    SELECT DISTINCT
      t.id AS tag_id, t.tag_code, t.tag_name, t.kind,
      anc.raw_name, anc.origin_name,
      mount.canonical_name AS mount_name,
      tem.match_mode,
      (anc.depth = 0) AS direct
    FROM anc
    JOIN tag_entity_map tem
      ON tem.entity_id = anc.node_id AND (tem.match_mode = 'subtree' OR anc.depth = 0)
    JOIN tags t ON t.id = tem.tag_id AND t.mode = 'list'
    JOIN entities mount ON mount.id = anc.node_id
    ORDER BY t.tag_code, anc.raw_name
  `);

  const byTag = new Map<string, DerivedTag>();
  for (const raw of res.rows as Record<string, unknown>[]) {
    const tagId = raw.tag_id as string;
    let entry = byTag.get(tagId);
    if (!entry) {
      entry = {
        tagId,
        tagCode: raw.tag_code as string,
        tagName: raw.tag_name as string,
        kind: raw.kind as string,
        paths: [],
      };
      byTag.set(tagId, entry);
    }
    entry.paths.push({
      rawName: raw.raw_name as string,
      originName: raw.origin_name as string,
      mountName: raw.mount_name as string,
      matchMode: raw.match_mode as string,
      direct: raw.direct as boolean,
    });
  }
  return [...byTag.values()];
}
