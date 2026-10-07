import type { Prisma } from "@prisma/client";
import { SITE } from "./seo";

export type AdminResult = {
  ok: boolean;
  message: string;
  challenge?: string;
  stage?: string;
};
export type AdminAction = (data: FormData) => Promise<AdminResult | void>;
export const ok = (message = "تم حفظ التغييرات"): AdminResult => ({
  ok: true,
  message,
});
export const fail = (message = "راجع البيانات المدخلة"): AdminResult => ({
  ok: false,
  message,
});
export type AdminParams = Record<string, string | string[] | undefined>;
export function text(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
export function pageNumber(value: unknown) {
  const n = Number(text(value, 8));
  return Number.isSafeInteger(n) && n >= 1 && n <= 100000 ? n : 1;
}
export const ADMIN_PAGE_SIZE = 25;
export function pageQuery(params: AdminParams) {
  const page = pageNumber(params.page);
  return { page, take: ADMIN_PAGE_SIZE, skip: (page - 1) * ADMIN_PAGE_SIZE };
}
export function publicUrl(path: string) {
  return `${SITE}${path.startsWith("/") ? path : `/${path}`}`;
}
export function safeLink(raw: string) {
  if (!raw) return true;
  if (/^\/(?!\/)/.test(raw) && !raw.includes("\\")) return true;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}
export function integer(data: FormData, key: string, min: number, max: number, fallback?: number) {
  const raw = data.get(key);
  const value = raw === null || raw === "" ? fallback : Number(raw);
  return Number.isSafeInteger(value) && value! >= min && value! <= max ? value! : null;
}
export async function audit(
  tx: Prisma.TransactionClient,
  actorId: string,
  action: string,
  detail: string,
) {
  await tx.auditLog.create({
    data: { actorId, action, detail: detail.slice(0, 4000) },
  });
}

export function publicAsset(url: string) {
  return url.startsWith("/") ? publicUrl(url) : url;
}
