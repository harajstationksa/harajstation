import { describe, expect, it } from "vitest";
import { classifyListing, isLikelyDuplicate } from "../src/lib/smart-review";

const review = (
  title: string,
  description = "إعلان أصلي بحالة جيدة ومعلومات واضحة",
  categorySlug = "electronics",
) => classifyListing({ title, description, categorySlug });

describe("lightweight Saudi marketplace review", () => {
  it.each([
    ["نوفر سيولة تابي وتمارا", "FINANCING"],
    ["حول حد تابي إلى كاش", "FINANCING"],
    ["تمارا كاش فوري", "FINANCING"],
    ["نصدر وثائق تأمين سيارات", "INSURANCE"],
    ["إدارة محافظ وتوصيات أسهم", "INVESTMENT"],
    ["نوفر عمالة للشركات", "RECRUITMENT"],
  ] as const)("holds regulated offer: %s", (title, reason) => {
    const result = review(title);
    expect(result.level).toBe("REGULATED");
    expect(result.reasons).toContain(reason);
  });

  it("holds real estate by parent category, including a misleading subcategory", () => {
    const result = classifyListing({
      title: "فيلا للبيع",
      description: "فيلا جديدة في الرياض",
      categorySlug: "villas",
      parentSlug: "realestate",
    });
    expect(result.level).toBe("REGULATED");
    expect(result.reasons).toContain("REAL_ESTATE");
  });
  it.each([
    ["جهاز طبي للبيع", "MEDICAL"],
    ["صقر للبيع", "WILDLIFE"],
    ["تأجير سيارات يومي", "VEHICLE_RENTAL"],
  ] as const)("holds sensitive item: %s", (title, reason) => {
    const result = review(title);
    expect(result.level).toBe("SENSITIVE");
    expect(result.reasons).toContain(reason);
  });
  it.each(["حساب بنكي للبيع", "وثائق مزورة للبيع", "بيع سجائر جديدة", "هاي كوبي رولكس للبيع"])(
    "holds clearly prohibited offer: %s",
    (title) => expect(review(title).level).toBe("PROHIBITED"),
  );
  it.each([
    "آيفون للبيع بحالة جيدة",
    "كنب مستعمل للبيع",
    "سيارتي كانت تمويل وانتهى",
    "مطلوب محاسب لشركتنا",
    "هذا الجهاز كان مؤمن عليه",
    "دورة تدريبية في الأمن السيبراني",
  ])("keeps an ordinary listing normal: %s", (title) => {
    expect(review(title).level).toBe("NORMAL");
  });
  it("detects split finance spelling without trusting category", () => {
    expect(review("سـيـو_لة تا بي كاش", "نحول لك حد الشراء إلى نقد", "fashion").level).toBe(
      "REGULATED",
    );
  });
  it("warns only for the seller's close repeat in the same category and price", () => {
    const original = {
      title: "آيفون 15 جديد",
      description: "جهاز نظيف جدًا للبيع مع كامل الملحقات",
      categoryId: "phones",
      price: 2400,
    };
    expect(isLikelyDuplicate(original, [original])).toBe(true);
    expect(isLikelyDuplicate(original, [{ ...original, categoryId: "cars" }])).toBe(false);
  });
});
