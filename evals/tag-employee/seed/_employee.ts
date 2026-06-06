/**
 * tag-employee eval seed 公共件:把一个(脱敏的)员工 profile 插进 4 张员工表。
 * CLI 对 employee 只读,没有写命令,故 seed 走直插。被 seed/<case>.sh 调用,从 stdin 读 JSON。
 *
 * DATABASE_URL 由调用方提供(better-skills per-run 注入 worker DB;手动跑时自己 export 一个
 * **测试库** URL)。本脚本**不读 .env.local**——杜绝误把测试 fixture 写进 prod(5433)。
 *
 * 用法:  DATABASE_URL=postgres://.../talent_graph_test_wN  bun _employee.ts < profile.json
 *
 * profile JSON 结构:
 *   {
 *     "empId": "EVAL_*", "name": "...", "hrStatus": "在职"?,
 *     "workExperiences": [{ companyName, positionTitle?, startDate?, endDate?, country? }],
 *     "educations":      [{ school, major?, degree?, education?, startDate?, endDate? }],
 *     "resume": { "workList": <数组|字符串>, "updateTime"?: "ISO" }   // workList 数组会被 JSON.stringify
 *   }
 */

import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../../../src/db/schema";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("error: DATABASE_URL 未设置(seed 必须指向 worker 测试库)");
  process.exit(1);
}
const db = drizzle(url, { schema });

const p = JSON.parse(await new Response(Bun.stdin.stream()).text());

await db
  .insert(schema.employees)
  .values({ empId: p.empId, name: p.name, hrStatus: p.hrStatus ?? null });

if (p.workExperiences?.length) {
  await db.insert(schema.employeeWorkExperiences).values(
    p.workExperiences.map((w: any) => ({
      empId: p.empId,
      companyName: w.companyName,
      positionTitle: w.positionTitle ?? null,
      startDate: w.startDate ?? null,
      endDate: w.endDate ?? null,
      country: w.country ?? null,
    })),
  );
}

if (p.educations?.length) {
  await db.insert(schema.employeeEducations).values(
    p.educations.map((e: any) => ({
      empId: p.empId,
      school: e.school,
      major: e.major ?? null,
      degree: e.degree ?? null,
      education: e.education ?? null,
      startDate: e.startDate ?? null,
      endDate: e.endDate ?? null,
    })),
  );
}

if (p.resume) {
  const wl =
    typeof p.resume.workList === "string"
      ? p.resume.workList
      : JSON.stringify(p.resume.workList);
  await db.insert(schema.employeeResumes).values({
    empId: p.empId,
    workList: wl,
    updateTime: p.resume.updateTime ? new Date(p.resume.updateTime) : null,
  });
}

process.stderr.write(`seeded employee ${p.empId}\n`);
process.exit(0);
