import { createServerFn } from "@tanstack/react-start";
import {
  listTags,
  getTag,
  getTagMembers,
} from "@db/queries/tags";
import { requireSession } from "./session.server";

export const listTagsFn = createServerFn({ method: "GET" })
  .validator((data: { mode?: string; kind?: string }) => data)
  .handler(async ({ data }) => {
    await requireSession();
    return listTags({ mode: data.mode, kind: data.kind });
  });

export const getTagFn = createServerFn({ method: "GET" })
  .validator((data: { codeOrId: string }) => data)
  .handler(async ({ data }) => {
    await requireSession();
    return getTag(data.codeOrId);
  });

export const getTagMembersFn = createServerFn({ method: "GET" })
  .validator(
    (data: {
      codeOrId: string;
      confidence?: "confident" | "borderline" | "all";
      limit?: number;
      offset?: number;
    }) => data,
  )
  .handler(async ({ data }) => {
    await requireSession();
    return getTagMembers(data.codeOrId, {
      confidence: data.confidence,
      limit: data.limit,
      offset: data.offset,
    });
  });
