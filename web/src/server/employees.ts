import { createServerFn } from "@tanstack/react-start";
import { searchEmployees, getEmployeeProfile } from "@db/queries/employees";
import { requireSession } from "./session.server";

export const searchEmployeesFn = createServerFn({ method: "GET" })
  .validator((data: { q: string; limit?: number }) => data)
  .handler(async ({ data }) => {
    await requireSession();
    return searchEmployees(data.q, data.limit);
  });

export const getEmployeeProfileFn = createServerFn({ method: "GET" })
  .validator((data: { empId: string }) => data)
  .handler(async ({ data }) => {
    await requireSession();
    return getEmployeeProfile(data.empId);
  });
