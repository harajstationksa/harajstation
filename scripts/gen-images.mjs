// Generates SVG placeholder product images and marketing banners into /public.
// Run once: node scripts/gen-images.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = join(process.cwd(), "public", "images", "ph");
const bannerDir = join(process.cwd(), "public", "images", "banners");
mkdirSync(outDir, { recursive: true });
mkdirSync(bannerDir, { recursive: true });

// key: [glyph, hueA, hueB]
const items = {
  car1: ["🚙", 24, 36],
  car2: ["🚗", 210, 230],
  car3: ["🏎️", 0, 15],
  car4: ["🚘", 160, 180],
  bike1: ["🏍️", 260, 280],
  plate1: ["🔢", 200, 220],
  villa1: ["🏡", 100, 130],
  apt1: ["🏢", 190, 215],
  land1: ["🌄", 35, 55],
  phone1: ["📱", 215, 245],
  phone2: ["📱", 280, 310],
  laptop1: ["💻", 220, 200],
  console1: ["🎮", 250, 270],
  console2: ["🕹️", 140, 165],
  camera1: ["📷", 20, 40],
  tv1: ["📺", 230, 250],
  audio1: ["🎧", 300, 330],
  sofa1: ["🛋️", 25, 45],
  fridge1: ["🧊", 195, 215],
  ac1: ["❄️", 185, 205],
  watch1: ["⌚", 40, 60],
  bag1: ["👜", 330, 350],
  perfume1: ["🧴", 315, 340],
  falcon1: ["🦅", 30, 50],
  camel1: ["🐪", 35, 20],
  horse1: ["🐎", 25, 45],
  cat1: ["🐈", 45, 65],
  dumbbell1: ["🏋️", 200, 220],
  bicycle1: ["🚲", 120, 145],
  book1: ["📚", 30, 50],
  tools1: ["🛠️", 210, 230],
  chair1: ["🪑", 20, 40],
  tent1: ["⛺", 90, 115],
};

const svg = (glyph, a, b) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${a}, 65%, 90%)"/>
      <stop offset="1" stop-color="hsl(${b}, 60%, 78%)"/>
    </linearGradient>
  </defs>
  <rect width="800" height="600" fill="url(#g)"/>
  <circle cx="120" cy="90" r="150" fill="hsl(${a}, 70%, 95%)" opacity="0.5"/>
  <circle cx="700" cy="520" r="190" fill="hsl(${b}, 70%, 70%)" opacity="0.35"/>
  <circle cx="660" cy="110" r="60" fill="hsl(${b}, 70%, 88%)" opacity="0.6"/>
  <text x="400" y="330" font-size="200" text-anchor="middle" dominant-baseline="middle">${glyph}</text>
  <text x="400" y="560" font-size="26" text-anchor="middle" fill="hsl(${b}, 40%, 35%)" opacity="0.55" font-family="sans-serif">حراج ستيشن</text>
</svg>`;

for (const [key, [glyph, a, b]] of Object.entries(items)) {
  writeFileSync(join(outDir, `${key}.svg`), svg(glyph, a, b));
}

const banner = (id, from, to, big, small, glyphs) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 400" direction="rtl">
  <defs>
    <linearGradient id="bg${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="400" fill="url(#bg${id})"/>
  <circle cx="1450" cy="60" r="180" fill="#ffffff" opacity="0.08"/>
  <circle cx="180" cy="360" r="220" fill="#ffffff" opacity="0.07"/>
  <circle cx="1300" cy="330" r="90" fill="#ffffff" opacity="0.1"/>
  <text x="820" y="175" font-size="72" text-anchor="middle" fill="#ffffff" font-weight="bold" font-family="sans-serif">${big}</text>
  <text x="820" y="255" font-size="34" text-anchor="middle" fill="#ffffff" opacity="0.9" font-family="sans-serif">${small}</text>
  <text x="180" y="140" font-size="90" text-anchor="middle" opacity="0.9">${glyphs[0]}</text>
  <text x="1460" y="310" font-size="90" text-anchor="middle" opacity="0.9">${glyphs[1]}</text>
</svg>`;

writeFileSync(
  join(bannerDir, "auctions.svg"),
  banner(1, "#c75d3e", "#863c28", "مزادات حراج ستيشن المباشرة", "زايد الآن واربح أفضل الصفقات — بخصوصية وأمان تام", ["🔨", "🏆"])
);
writeFileSync(
  join(bannerDir, "pro.svg"),
  banner(2, "#171717", "#404040", "حساب برو للتجار", "إعلانات غير محدودة، أولوية في الظهور، وشارة مميزة — 99 ر.س شهرياً", ["⭐", "🚀"])
);
writeFileSync(
  join(bannerDir, "cars.svg"),
  banner(3, "#a64a30", "#db7759", "موسم السيارات في حراج ستيشن", "آلاف السيارات الجديدة والمستعملة بأفضل الأسعار", ["🚗", "🔑"])
);

console.log(`Generated ${Object.keys(items).length} product images + 3 banners`);
