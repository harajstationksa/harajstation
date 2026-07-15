import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { allSettings } from "@/lib/settings";
import { BannerImageField } from "@/components/BannerImageField";
import {
  createBannerAction,
  deleteBannerAction,
  saveContactInfoAction,
  saveSocialLinksAction,
  toggleBannerAction,
} from "../actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "إدارة البانرات" };

const POSITIONS: Record<string, string> = {
  HOME_TOP: "الرئيسية — أعلى",
  HOME_MIDDLE: "الرئيسية — وسط",
  CATEGORY_TOP: "صفحة الفئة — أعلى",
  AUCTION_SIDE: "صفحة المزاد — جانبي",
};

export default async function AdminBannersPage() {
  await requireStaff(["ADMIN"]);

  const [banners, settings] = await Promise.all([
    db.banner.findMany({ orderBy: { createdAt: "desc" } }),
    allSettings(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="section-title">إدارة البانرات الإعلانية</h1>

      {/* footer social links */}
      <form action={saveSocialLinksAction} className="card p-5 space-y-4">
        <h2 className="font-bold">روابط التواصل الاجتماعي (الفوتر)</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">إنستجرام</label>
            <input
              name="SOCIAL_INSTAGRAM"
              className="input"
              dir="ltr"
              placeholder="https://instagram.com/..."
              defaultValue={settings.SOCIAL_INSTAGRAM}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">فيسبوك</label>
            <input
              name="SOCIAL_FACEBOOK"
              className="input"
              dir="ltr"
              placeholder="https://facebook.com/..."
              defaultValue={settings.SOCIAL_FACEBOOK}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">سناب شات</label>
            <input
              name="SOCIAL_SNAPCHAT"
              className="input"
              dir="ltr"
              placeholder="https://snapchat.com/add/..."
              defaultValue={settings.SOCIAL_SNAPCHAT}
            />
          </div>
        </div>
        <button className="btn-primary">حفظ الروابط</button>
        <p className="text-xs text-neutral-400">
          يجب أن يبدأ الرابط بـ https:// — اترك الحقل فارغاً لتعطيل الأيقونة في الفوتر.
        </p>
      </form>

      {/* contact page details */}
      <form action={saveContactInfoAction} className="card p-5 space-y-4">
        <h2 className="font-bold">بيانات صفحة «تواصل معنا»</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">البريد الإلكتروني</label>
            <input
              name="CONTACT_EMAIL"
              className="input"
              dir="ltr"
              placeholder="support@example.com"
              defaultValue={settings.CONTACT_EMAIL}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">الهاتف</label>
            <input
              name="CONTACT_PHONE"
              className="input"
              dir="ltr"
              placeholder="920000000"
              defaultValue={settings.CONTACT_PHONE}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">واتساب الأعمال</label>
            <input
              name="CONTACT_WHATSAPP"
              className="input"
              dir="ltr"
              placeholder="+966 5X XXX XXXX"
              defaultValue={settings.CONTACT_WHATSAPP}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">ساعات العمل</label>
            <input
              name="CONTACT_HOURS"
              className="input"
              placeholder="الأحد – الخميس، 9 صباحاً – 6 مساءً"
              defaultValue={settings.CONTACT_HOURS}
            />
          </div>
        </div>
        <button className="btn-primary">حفظ بيانات التواصل</button>
        <p className="text-xs text-neutral-400">
          اترك أي حقل فارغاً لإخفاء بطاقته من صفحة «تواصل معنا».
        </p>
      </form>

      {/* create */}
      <form action={createBannerAction} className="card p-5 space-y-4">
        <h2 className="font-bold">إضافة بانر جديد</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">العنوان</label>
            <input name="title" className="input" required placeholder="حملة رمضان" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">الموضع</label>
            <select name="position" className="input" defaultValue="HOME_TOP">
              {Object.entries(POSITIONS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">
              رابط الوجهة <span className="text-neutral-400">(اختياري)</span>
            </label>
            <input name="linkUrl" className="input" dir="ltr" placeholder="/auctions" />
          </div>

          <BannerImageField
            name="imageUrl"
            label="صورة البانر (سطح المكتب)"
            ratio={4}
            recommended="1600 × 400"
            hint="تُعرض على الشاشات الكبيرة. إن لم ترفع نسخة للهاتف، ستُستخدم هذه الصورة أيضاً على الهاتف مع اقتطاع الأطراف."
          />
          <BannerImageField
            name="mobileImageUrl"
            label="صورة الهاتف (اختياري)"
            ratio={2}
            recommended="1080 × 540"
            hint="تصميم أنسب للشاشات الضيقة — يظهر تلقائياً على الهواتف بدل الصورة العريضة."
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">
            كود مضمّن <span className="text-neutral-400">(اختياري — AdSense / يوتيوب / تيك توك، يُعرض بدل الصورة)</span>
          </label>
          <textarea
            name="embedHtml"
            className="input min-h-20 py-3 font-mono text-xs"
            dir="ltr"
            placeholder='<iframe src="https://www.youtube.com/embed/..." ...></iframe>'
          />
        </div>
        <button className="btn-primary">حفظ ونشر</button>
      </form>

      {/* list */}
      <div className="grid gap-4">
        {banners.map((b) => (
          <div key={b.id} className="card overflow-hidden">
            {b.embedHtml ? (
              <div
                className="w-full aspect-4/1 bg-neutral-100 [&_iframe]:w-full [&_iframe]:h-full"
                dangerouslySetInnerHTML={{ __html: b.embedHtml }}
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={b.imageUrl ?? ""} alt={b.title} className="w-full aspect-4/1 object-cover" />
            )}
            <div className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-bold">{b.title}</p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {POSITIONS[b.position] ?? b.position} · {b.clicks} نقرة
                  {b.mobileImageUrl && <span className="mr-2">· 📱 نسخة للهاتف</span>}
                  {b.linkUrl && <span dir="ltr" className="mr-2">→ {b.linkUrl}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge ${b.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>
                  {b.status === "ACTIVE" ? "نشط" : "معطل"}
                </span>
                <form action={toggleBannerAction}>
                  <input type="hidden" name="bannerId" value={b.id} />
                  <button className="badge bg-neutral-800 text-white cursor-pointer hover:bg-neutral-700">
                    {b.status === "ACTIVE" ? "تعطيل" : "تفعيل"}
                  </button>
                </form>
                <form action={deleteBannerAction}>
                  <input type="hidden" name="bannerId" value={b.id} />
                  <button className="badge bg-red-600 text-white cursor-pointer hover:bg-red-700">
                    حذف
                  </button>
                </form>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
