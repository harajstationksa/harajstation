import type { Instrumentation } from "next";

// Central error metadata only: no request URLs, headers, bodies, or error text.
export const onRequestError: Instrumentation.onRequestError = async (_error, _request, context) => {
  console.error("server_request_failed", {
    route: context.routePath,
    kind: context.routeType,
  });
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { db } = await import("./lib/db");
      await db.operationalCheck.upsert({
        where: { key: "serverRequests" },
        create: { key: "serverRequests", lastFailureAt: new Date() },
        update: { lastFailureAt: new Date() },
      });
      const key = `serverRoute:${context.routePath} (${context.routeType})`;
      await db.operationalCheck.upsert({
        where: { key },
        create: { key, lastFailureAt: new Date() },
        update: { lastFailureAt: new Date() },
      });
    } catch {
      /* The central process log still records database outages. */
    }
  }
};
