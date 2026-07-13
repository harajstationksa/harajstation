/** TEMP: walk the whole publish flow and check every rejection is human + safe. */
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const db = new PrismaClient();
const BASE = "https://harajstation.com";

async function cookie(sub: string, role: string, name: string) {
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
  const t = await new SignJWT({ sub, role, name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
  return `samel_session=${t}`;
}

// anything here in a message means we are leaking our internals at the user
const LEAKS = [
  "prisma", "PrismaClient", "Invalid `", "at async", "Error:", "undefined",
  "null", "stack", "ECONNREFUSED", "P20", "supabase", "postgres", "TypeError",
  "cannot read", "internal", "/var/www", "node_modules",
];

async function probe(label: string, fields: Record<string, string>, ck: string, expect: number) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);

  const res = await fetch(`${BASE}/api/listings`, { method: "POST", body: fd, headers: { cookie: ck } });
  const body = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string> };
  const msg = body.error ?? "(no message)";

  const leak = LEAKS.find((w) => msg.toLowerCase().includes(w.toLowerCase()));
  const arabic = /[؀-ۿ]/.test(msg);
  const statusOk = res.status === expect;

  const flag = leak ? "LEAK" : !arabic ? "NOT-AR" : !statusOk ? `WANT ${expect}` : "ok";
  console.log(`  [${flag.padEnd(7)}] ${label.padEnd(30)} ${res.status}  "${msg.slice(0, 78)}"`);
  if (body.fields) console.log(`             fields: ${Object.keys(body.fields).join(", ")}`);
}

async function main() {
  const user = await db.user.findFirst({ where: { role: "ADMIN" } });
  const other = await db.category.findFirst({ where: { slug: "other" } });
  const cars = await db.category.findFirst({ where: { slug: "cars" } });
  if (!user || !other || !cars) throw new Error("missing fixtures");
  const ck = await cookie(user.id, user.role, user.name);

  const good = {
    type: "STANDARD", goal: "SELL", categoryId: other.id,
    title: "عنوان صالح للاختبار", city: "الرياض", condition: "USED", price: "500",
    description: "وصف طويل بما يكفي لتجاوز الحد الأدنى المطلوب في النموذج.",
  };

  console.log("\n— what a seller sees when something is missing or wrong —\n");
  await probe("no title", { ...good, title: "" }, ck, 400);
  await probe("title too short", { ...good, title: "اب" }, ck, 400);
  await probe("description too short", { ...good, description: "قصير" }, ck, 400);
  await probe("no city", { ...good, city: "" }, ck, 400);
  await probe("made-up city", { ...good, city: "القاهرة" }, ck, 400);
  await probe("no category", { ...good, categoryId: "" }, ck, 400);
  await probe("category that doesn't exist", { ...good, categoryId: "xxxxxxxxxxxx" }, ck, 400);
  await probe("price is text", { ...good, price: "غالي" }, ck, 400);
  await probe("price is zero", { ...good, price: "0" }, ck, 400);
  await probe("negative price", { ...good, price: "-5" }, ck, 400);
  await probe("several missing at once", { type: "STANDARD", goal: "SELL", categoryId: other.id }, ck, 400);
  await probe("car without required brand", { ...good, categoryId: cars.id }, ck, 400);

  console.log("\n— auctions —\n");
  const auc = { ...good, type: "AUCTION", goal: "AUCTION", categoryId: other.id };
  await probe("auction: no start price", { ...auc, startPrice: "", minIncrement: "10", durationHours: "24" }, ck, 400);
  await probe("auction: zero start price", { ...auc, startPrice: "0", minIncrement: "10", durationHours: "24" }, ck, 400);
  await probe("auction: no increment", { ...auc, startPrice: "100", minIncrement: "", durationHours: "24" }, ck, 400);
  await probe("auction: bad duration", { ...auc, startPrice: "100", minIncrement: "10", durationHours: "3" }, ck, 400);
  await probe("auction: buy-now below start", { ...auc, startPrice: "100", minIncrement: "10", durationHours: "24", buyNowPrice: "50" }, ck, 400);

  console.log("\n— not signed in —\n");
  const res = await fetch(`${BASE}/api/listings`, { method: "POST", body: new FormData() });
  const b = await res.json().catch(() => ({}));
  console.log(`  [ok     ] ${"no session".padEnd(30)} ${res.status}  "${b.error}"`);

  await db.listing.deleteMany({ where: { sellerId: user.id, title: "عنوان صالح للاختبار" } });
}

main().catch(console.error).finally(() => db.$disconnect());
