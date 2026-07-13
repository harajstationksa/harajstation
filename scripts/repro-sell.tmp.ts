/** TEMP: reproduce the "طلب غير صالح" a real seller hit, against the live site. */
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import sharp from "sharp";

const db = new PrismaClient();
const BASE = process.env.TARGET ?? "https://harajstation.com";

async function cookie(sub: string, role: string, name: string) {
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
  const t = await new SignJWT({ sub, role, name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
  return `samel_session=${t}`;
}

/** A photo roughly the size a phone camera produces (noise resists compression). */
async function photo(mb: number) {
  const side = Math.round(Math.sqrt((mb * 1024 * 1024) / 1.6));
  const raw = Buffer.alloc(side * side * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = Math.floor(Math.random() * 256);
  return sharp(raw, { raw: { width: side, height: side, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

async function attempt(label: string, images: Buffer[], cat: string, ck: string) {
  const fd = new FormData();
  fd.set("type", "STANDARD");
  fd.set("goal", "SELL");
  fd.set("categoryId", cat);
  fd.set("title", "مجموعة عملات قديمة للبيع");
  fd.set("description", "مجموعة عملات معدنية قديمة بحالة ممتازة، محفوظة في غلاف خاص منذ سنوات.");
  fd.set("condition", "USED");
  fd.set("city", "الرياض");
  fd.set("price", "500");
  images.forEach((b, i) =>
    fd.append("images", new File([new Uint8Array(b)], `p${i}.jpg`, { type: "image/jpeg" }))
  );

  const total = images.reduce((s, b) => s + b.length, 0);
  try {
    const res = await fetch(`${BASE}/api/listings`, {
      method: "POST",
      body: fd,
      headers: { cookie: ck },
    });
    const text = await res.text();
    let body: string;
    try {
      body = JSON.stringify(JSON.parse(text)).slice(0, 90);
    } catch {
      body = `[not JSON] ${text.slice(0, 60).replace(/\s+/g, " ")}`;
    }
    const mark = res.status === 200 ? "OK  " : "FAIL";
    console.log(`  ${mark} ${label.padEnd(24)} ${(total / 1048576).toFixed(1).padStart(5)}MB -> ${res.status} ${body}`);
  } catch (e) {
    console.log(`  FAIL ${label.padEnd(24)} ${(total / 1048576).toFixed(1)}MB -> ${(e as Error).message}`);
  }
}

async function main() {
  const user = await db.user.findFirst({ where: { role: "ADMIN" } });
  const cat = await db.category.findFirst({ where: { slug: "other" } });
  if (!user || !cat) throw new Error("missing user/category");
  const ck = await cookie(user.id, user.role, user.name);

  console.log(`target: ${BASE}\n`);
  const p2 = await photo(2);
  const p4 = await photo(4);

  await attempt("5 x 2MB (under 10MB)", [p2, p2, p2, p2, p2], cat.id, ck);
  await attempt("4 x 4MB (over 10MB)", [p4, p4, p4, p4], cat.id, ck);
  await attempt("8 x 4MB (~30MB)", Array(8).fill(p4), cat.id, ck);

  const gone = await db.listing.deleteMany({
    where: { sellerId: user.id, title: "مجموعة عملات قديمة للبيع" },
  });
  console.log(`\n  cleaned up ${gone.count} test listing(s)`);
}

main().catch(console.error).finally(() => db.$disconnect());
