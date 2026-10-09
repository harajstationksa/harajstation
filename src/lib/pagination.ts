/** Bound offsets before they reach PostgreSQL. APIs reject; pages normalize. */
export function parsePage(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return 1;
  if (typeof value !== "string" || !/^[1-9]\d{0,4}$/.test(value)) return null;
  const page = Number(value);
  return page <= 10000 ? page : null;
}
export const pageNumber = (value: unknown) => parsePage(value) ?? 1;
