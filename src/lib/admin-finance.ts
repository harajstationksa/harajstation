import { text, type AdminParams } from "./admin";
export function financeFilter(sp: AdminParams) {
  const q = text(sp.q),
    status = ["PENDING", "PAID", "FAILED"].includes(text(sp.status)) ? text(sp.status) : "";
  function date(value: unknown) {
    const raw = text(value, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return;
    const d = new Date(raw + "T00:00:00.000Z");
    return Number.isFinite(d.getTime()) ? d : undefined;
  }
  const from = date(sp.from),
    end = date(sp.to),
    to = end ? new Date(end.getTime() + 86400000) : undefined;
  const common = {
    ...(q
      ? {
          user: {
            OR: [
              { email: { contains: q, mode: "insensitive" as const } },
              { name: { contains: q, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lt: to } : {}),
          },
        }
      : {}),
  };
  return {
    q,
    status,
    common,
    payments: { ...common, ...(status ? { status } : {}) },
  };
}
export function csvCell(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  let v = String(value ?? "");
  if (/^[=+@\-\t\r]/.test(v)) v = "'" + v;
  return '"' + v.replaceAll('"', '""') + '"';
}
