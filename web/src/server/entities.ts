import { createServerFn } from "@tanstack/react-start";
import { listEntities, getEntity } from "@db/queries/entities";
import { requireSession } from "./session.server";

export const listEntitiesFn = createServerFn({ method: "GET" })
  .validator(
    (data: { type?: string; q?: string; limit?: number; offset?: number }) =>
      data,
  )
  .handler(async ({ data }) => {
    await requireSession();
    return listEntities(data);
  });

export const getEntityFn = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    await requireSession();
    return getEntity(data.id);
  });
