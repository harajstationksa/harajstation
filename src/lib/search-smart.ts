import { arabicTerms, normalizeArabic } from "./arabic";

/**
 * Smart-search knowledge base.
 *
 * Two layers make the search "understand" what the user means:
 *
 * 1. SYNONYM_GROUPS — spelling/transliteration equivalents. A query term is
 *    expanded to its whole group, so "ايفون" also matches listings that only
 *    say "iphone", and vice-versa. All Arabic entries are written in the
 *    NORMALIZED form produced by normalizeArabic (ا not أ, ه not ة, ي not ى).
 *
 * 2. CATEGORY_KEYWORDS — brand/product words that imply a category. Searching
 *    "ايفون" not only finds iPhone listings, it also tells the UI that the
 *    query belongs to the "phones" category so the category itself can be
 *    offered as a destination and results from it can be boosted.
 */

const SYNONYM_GROUPS: string[][] = [
  // ── electronics ──
  ["ايفون", "iphone", "أيفون", "افون"],
  ["ابل", "apple", "آبل"],
  ["سامسونج", "samsung", "سامسونغ", "سامسونق"],
  ["جالكسي", "galaxy", "قلاكسي", "غالاكسي", "جلكسي"],
  ["هواوي", "huawei"],
  ["شاومي", "xiaomi", "شياومي"],
  ["جوال", "موبايل", "هاتف", "تلفون", "phone"],
  ["ايباد", "ipad", "آيباد"],
  ["تابلت", "tablet", "جهاز لوحي"],
  ["لابتوب", "laptop", "لاب توب", "نوت بوك", "notebook"],
  ["ماك بوك", "macbook", "ماكبوك"],
  ["كمبيوتر", "computer", "حاسب", "حاسوب", "pc"],
  ["بلايستيشن", "playstation", "بلاي ستيشن", "سوني 5", "ps5", "ps4"],
  ["اكس بوكس", "xbox", "اكسبوكس"],
  ["نينتندو", "nintendo", "سويتش", "switch"],
  ["سماعه", "سماعات", "headset", "headphones"],
  ["ايربودز", "airpods", "اير بودز"],
  ["كاميرا", "camera", "كام"],
  ["شاشه", "تلفزيون", "تلفاز", "tv"],
  // ── vehicles ──
  ["سياره", "سيارات", "عربيه", "car"],
  ["تويوتا", "toyota"],
  ["كامري", "camry"],
  ["كورولا", "corolla"],
  ["هيونداي", "hyundai", "هونداي"],
  ["سوناتا", "sonata"],
  ["نيسان", "nissan"],
  ["باترول", "patrol"],
  ["لاندكروزر", "landcruiser", "لاند كروزر", "لندكروزر"],
  ["مرسيدس", "mercedes", "مرسدس"],
  ["بي ام دبليو", "bmw", "بمو"],
  ["لكزس", "lexus", "ليكزس"],
  ["فورد", "ford"],
  ["شفروليه", "chevrolet", "شفر"],
  ["جيب", "jeep"],
  ["كيا", "kia"],
  ["دباب", "دبابه", "دراجه ناريه", "motorcycle"],
  // ── home ──
  ["ثلاجه", "براد", "fridge", "refrigerator"],
  ["غساله", "washer", "washing machine"],
  ["مكيف", "سبليت", "تكييف", "ac"],
  ["كنب", "كنبه", "صوفا", "sofa"],
  ["دولاب", "خزانه", "closet"],
  // ── fashion / luxury ──
  ["ساعه", "ساعات", "watch"],
  ["روليكس", "rolex"],
  ["عطر", "عطور", "perfume"],
  ["ذهب", "gold"],
  ["شنطه", "حقيبه", "bag"],
  // ── animals ──
  ["صقر", "صقور", "شاهين", "طير حر", "falcon"],
  ["قطه", "قطط", "بسه", "cat"],
  ["حصان", "خيل", "خيول", "فرس", "horse"],
  ["جمل", "بعير", "ناقه", "camel"],
  // ── realestate / work ──
  ["شقه", "شقق", "apartment"],
  ["فيلا", "فلل", "villa"],
  ["ارض", "اراضي", "قطعه ارض", "land"],
  ["وظيفه", "وظائف", "عمل", "توظيف", "job"],
];

/** category slug → keywords implying it (normalized Arabic + lowercase Latin) */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  phones: ["ايفون", "iphone", "جوال", "موبايل", "هاتف", "تلفون", "سامسونج", "samsung", "جالكسي", "galaxy", "هواوي", "huawei", "شاومي", "xiaomi", "بيكسل", "pixel", "نوكيا", "nokia", "ابل", "apple"],
  tablets: ["ايباد", "ipad", "تابلت", "tablet", "جهاز لوحي"],
  laptops: ["لابتوب", "laptop", "ماك بوك", "macbook", "نوت بوك", "ديل", "dell", "لينوفو", "lenovo", "اسوس", "asus", "اتش بي"],
  desktops: ["كمبيوتر", "حاسب مكتبي", "pc", "بي سي"],
  gaming: ["بلايستيشن", "playstation", "ps5", "ps4", "اكس بوكس", "xbox", "نينتندو", "nintendo", "سويتش", "يد تحكم", "قيمنق", "gaming"],
  audio: ["سماعه", "سماعات", "ايربودز", "airpods", "مكبر صوت", "speaker"],
  cameras: ["كاميرا", "camera", "كانون", "canon", "نيكون", "nikon", "عدسه", "قو برو", "gopro"],
  tvs: ["شاشه", "تلفزيون", "تلفاز", "tv", "بروجكتر"],
  "cars-sale": ["سياره", "سيارات", "عربيه", "تويوتا", "كامري", "كورولا", "هيونداي", "سوناتا", "نيسان", "باترول", "لاندكروزر", "مرسيدس", "بي ام دبليو", "bmw", "لكزس", "فورد", "شفروليه", "جيب", "كيا", "هوندا", "يوكن", "تاهو", "car", "toyota"],
  motorcycles: ["دباب", "دبابه", "دراجه ناريه", "motorcycle", "هارلي"],
  trucks: ["شاحنه", "دينه", "قلاب", "معدات ثقيله"],
  boats: ["قارب", "يخت", "جت سكي"],
  "auto-parts": ["قطع غيار", "كفرات", "جنوط", "بطاريه سياره"],
  plates: ["لوحه مميزه", "لوحات مميزه", "لوحه سياره"],
  "vip-numbers": ["رقم مميز", "ارقام مميزه"],
  "apts-sale": ["شقه للبيع", "شقق للبيع", "تمليك"],
  "apts-rent": ["شقه للايجار", "شقق للايجار", "ايجار شقه"],
  villas: ["فيلا", "فلل", "دوبلكس", "villa"],
  land: ["ارض", "اراضي", "قطعه ارض"],
  farms: ["مزرعه", "استراحه", "شاليه"],
  realestate: ["عقار", "عقارات"],
  bedrooms: ["غرفه نوم", "سرير", "مرتبه"],
  living: ["كنب", "كنبه", "مجلس", "طقم كنب", "صوفا"],
  appliances: ["ثلاجه", "غساله", "مكيف", "سبليت", "فرن", "ميكروويف", "نشافه"],
  watches: ["ساعه", "ساعات", "روليكس", "rolex", "اوميغا", "كاسيو", "watch"],
  perfumes: ["عطر", "عطور", "دهن عود", "بخور"],
  jewelry: ["ذهب", "مجوهرات", "خاتم", "سلسله", "الماس", "سبيكه"],
  bags: ["شنطه", "حقيبه", "شنط"],
  falcons: ["صقر", "صقور", "شاهين", "طير حر", "قرموشه"],
  cats: ["قطه", "قطط", "شيرازي", "سكوتش", "بسه"],
  birds: ["ببغاء", "كناري", "عصافير", "حمام", "طيور"],
  horses: ["حصان", "خيل", "خيول", "فرس"],
  camels: ["جمل", "ابل", "ناقه", "بعير"],
  sheep: ["غنم", "خروف", "ماعز", "تيس", "نعجه"],
  bicycles: ["دراجه هوائيه", "سيكل", "bicycle"],
  gym: ["جهاز رياضي", "سير كهربائي", "اوزان", "دمبل"],
  jobs: ["وظيفه", "وظائف", "توظيف", "مطلوب موظف", "فرصه عمل"],
  "full-time": ["دوام كامل"],
  "part-time": ["دوام جزئي"],
  remote: ["عمل عن بعد"],
};

/** index: normalized keyword → its synonym group */
const synonymIndex = new Map<string, string[]>();
for (const group of SYNONYM_GROUPS) {
  const norm = group.map((g) => normalizeArabic(g));
  for (const term of norm) synonymIndex.set(term, norm);
}

/**
 * Expand a raw query into groups of equivalent terms. Each group must match
 * (AND across groups), any member of a group may match (OR within a group).
 * Multi-word synonyms are checked against the whole normalized query first.
 */
export function expandQuery(q: string): string[][] {
  const norm = normalizeArabic(q);
  const groups: string[][] = [];
  const consumed = new Set<string>();

  // whole-phrase synonyms (e.g. "لاند كروزر", "بلاي ستيشن")
  for (const [key, group] of synonymIndex) {
    if (key.includes(" ") && norm.includes(key)) {
      groups.push(group);
      key.split(" ").forEach((w) => consumed.add(w));
    }
  }
  for (const term of arabicTerms(q)) {
    if (consumed.has(term)) continue;
    groups.push(synonymIndex.get(term) ?? [term]);
  }
  return groups;
}

/**
 * Which category slugs does this query imply? ("ايفون" → phones)
 * Ranked by how many keywords hit; used to suggest categories in search
 * and to focus sponsored-ad targeting.
 */
export function matchCategorySlugs(q: string): string[] {
  const norm = ` ${normalizeArabic(q)} `;
  const scored: { slug: string; hits: number }[] = [];
  for (const [slug, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let hits = 0;
    for (const kw of keywords) {
      // word-boundary containment: the keyword appears as whole word(s)
      if (norm.includes(` ${normalizeArabic(kw)} `)) hits++;
    }
    if (hits > 0) scored.push({ slug, hits });
  }
  return scored.sort((a, b) => b.hits - a.hits).map((s) => s.slug);
}
