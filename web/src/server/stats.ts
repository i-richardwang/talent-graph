import { createServerFn } from "@tanstack/react-start";
import { getOverviewStats } from "@db/queries/overview";
import { requireSession } from "./session.server";

// 总览页数据源。每个业务 server function 的第一步都过 requireSession()(认证 seam),
// 再调共享只读查询层 —— 派生/聚合逻辑都在 src/db/queries/ 里,web 不重写。
export const getOverviewStatsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireSession();
    return getOverviewStats();
  },
);
