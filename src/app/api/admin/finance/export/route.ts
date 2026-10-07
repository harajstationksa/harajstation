import { db } from "@/lib/db";
import { getAdminCurrentUser } from "@/lib/auth";
import { financeFilter, csvCell } from "@/lib/admin-finance";
export async function GET(req: Request) {
  if (!(await getAdminCurrentUser(["ADMIN", "ACCOUNTANT"], "finance.export")))
    return new Response("Forbidden", { status: 403 });
  const sp = Object.fromEntries(new URL(req.url).searchParams),
    filter = financeFilter(sp),
    ledger = sp.kind === "ledger";
  // Snapshot upper timestamp excludes records created while this download is streaming.
  const at = new Date(),
    where = {
      ...(ledger ? filter.common : filter.payments),
      createdAt: { ...filter.common.createdAt, lte: at },
    };
  let cursor: string | undefined,
    started = false;
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        if (!started) {
          started = true;
          controller.enqueue(
            new TextEncoder().encode(
              "\uFEFF" +
                (ledger
                  ? ["id", "email", "delta_points", "reason", "createdAt"]
                  : ["id", "email", "status", "amount_SAR", "points", "invoiceId", "createdAt"]
                ).join(",") +
                "\r\n",
            ),
          );
        }
        const args = {
          where,
          include: { user: { select: { email: true } } },
          orderBy: { id: "asc" as const },
          take: 250,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        };
        const rows = ledger
          ? await db.pointTransaction.findMany(args)
          : await db.payment.findMany(args);
        for (const row of rows) {
          const values =
            "delta" in row
              ? [row.id, row.user.email, row.delta, row.reason, row.createdAt.toISOString()]
              : [
                  row.id,
                  row.user.email,
                  row.status,
                  (row.amount / 100).toFixed(2),
                  row.points,
                  row.invoiceId,
                  row.createdAt.toISOString(),
                ];
          controller.enqueue(new TextEncoder().encode(values.map(csvCell).join(",") + "\r\n"));
        }
        if (rows.length < 250) controller.close();
        else cursor = rows.at(-1)!.id;
      } catch {
        controller.error(new Error("export_failed"));
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ledger ? "point-ledger" : "payments"}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
