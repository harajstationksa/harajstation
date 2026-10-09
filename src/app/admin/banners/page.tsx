import { AdminPageHeader } from "@/components/AdminPageHeader";
import { publicAsset } from "@/lib/admin";
import { AdminActionForm } from "@/components/AdminActionForm";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { allSettings } from "@/lib/settings";
import { BannerImageField } from "@/components/BannerImageField";
import { safeBannerEmbedUrl } from "@/lib/banner-embed";
import {
  updateBannerAction,
  createBannerAction,
  deleteBannerAction,
  saveContactInfoAction,
  saveSocialLinksAction,
  toggleBannerAction,
  toggleHomeStatsAction,
} from "../actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "إدارة البانرات" };

const POSITIONS: Record<string, string> = {
  HOME_TOP: "الرئيسية — أعلى",
  HOME_MIDDLE: "الرئيسية — وسط",
};

export default async function AdminBannersPage() {
  await requireStaff(["ADMIN"], "banners.manage");

  const [banners, settings] = await Promise.all([
    db.banner.findMany({ orderBy: { createdAt: "desc" } }),
    allSettings(),
  ]);
  const statsVisible = settings.HOME_STATS_VISIBLE === "1";

  return (
    <div className="space-y-6">
      <AdminPageHeader section="banners">إدارة البانرات الإعلانية</AdminPageHeader>

      {/* homepage stats strip visibility */}
      <div className="card p-5 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold">بانر الإحصائيات (الرئيسية)</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            الشريط الأسود أسفل الصفحة الرئيسية: إعلان نشط · مزاد مباشر · مستخدم موثوق
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`badge ${statsVisible ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}
          >
            {statsVisible ? "ظاهر" : "مخفي"}
          </span>
          <AdminActionForm action={toggleHomeStatsAction}>
            <button className="badge bg-neutral-800 text-white cursor-pointer hover:bg-neutral-700">
              {statsVisible ? "إخفاء" : "إظهار"}
            </button>
          </AdminActionForm>
        </div>
      </div>

      {/* footer social links */}
      <AdminActionForm action={saveSocialLinksAction} className="card p-5 space-y-4">
        <h2 className="font-bold">روابط التواصل الاجتماعي (الفوتر)</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5" htmlFor="a11y-page-1">
              إنستجرام
            </label>
            <input
              name="SOCIAL_INSTAGRAM"
              className="input"
              dir="ltr"
              placeholder="https://instagram.com/..."
              defaultValue={settings.SOCIAL_INSTAGRAM}
              id="a11y-page-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" htmlFor="a11y-page-2">
              فيسبوك
            </label>
            <input
              name="SOCIAL_FACEBOOK"
              className="input"
              dir="ltr"
              placeholder="https://facebook.com/..."
              defaultValue={settings.SOCIAL_FACEBOOK}
              id="a11y-page-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" htmlFor="a11y-page-3">
              سناب شات
            </label>
            <input
              name="SOCIAL_SNAPCHAT"
              className="input"
              dir="ltr"
              placeholder="https://snapchat.com/add/..."
              defaultValue={settings.SOCIAL_SNAPCHAT}
              id="a11y-page-3"
            />
          </div>
        </div>
        <button className="btn-primary">حفظ الروابط</button>
        <p className="text-xs text-neutral-400">
          يجب أن يبدأ الرابط بـ https:// — اترك الحقل فارغاً لتعطيل الأيقونة في الفوتر.
        </p>
      </AdminActionForm>

      {/* contact page details */}
      <AdminActionForm action={saveContactInfoAction} className="card p-5 space-y-4">
        <h2 className="font-bold">بيانات صفحة «تواصل معنا»</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5" htmlFor="a11y-page-4">
              البريد الإلكتروني
            </label>
            <input
              name="CONTACT_EMAIL"
              className="input"
              dir="ltr"
              placeholder="support@example.com"
              defaultValue={settings.CONTACT_EMAIL}
              id="a11y-page-4"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" htmlFor="a11y-page-5">
              الهاتف
            </label>
            <input
              name="CONTACT_PHONE"
              className="input"
              dir="ltr"
              placeholder="920000000"
              defaultValue={settings.CONTACT_PHONE}
              id="a11y-page-5"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" htmlFor="a11y-page-6">
              واتساب الأعمال
            </label>
            <input
              name="CONTACT_WHATSAPP"
              className="input"
              dir="ltr"
              placeholder="+966 5X XXX XXXX"
              defaultValue={settings.CONTACT_WHATSAPP}
              id="a11y-page-6"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" htmlFor="a11y-page-7">
              ساعات العمل
            </label>
            <input
              name="CONTACT_HOURS"
              className="input"
              placeholder="الأحد – الخميس، 9 صباحاً – 6 مساءً"
              defaultValue={settings.CONTACT_HOURS}
              id="a11y-page-7"
            />
          </div>
        </div>
        <button className="btn-primary">حفظ بيانات التواصل</button>
        <p className="text-xs text-neutral-400">
          اترك أي حقل فارغاً لإخفاء بطاقته من صفحة «تواصل معنا».
        </p>
      </AdminActionForm>

      {/* create */}
      <AdminActionForm action={createBannerAction} className="card p-5 space-y-4">
        <h2 className="font-bold">إضافة بانر جديد</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5" htmlFor="a11y-page-8">
              العنوان
            </label>
            <input
              name="title"
              className="input"
              required
              placeholder="حملة رمضان"
              id="a11y-page-8"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" htmlFor="a11y-page-9">
              الموضع
            </label>
            <select name="position" className="input" defaultValue="HOME_TOP" id="a11y-page-9">
              {Object.entries(POSITIONS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" htmlFor="a11y-page-10">
              رابط الوجهة <span className="text-neutral-400">(اختياري)</span>
            </label>
            <input
              name="linkUrl"
              className="input"
              dir="ltr"
              placeholder="/auctions"
              id="a11y-page-10"
            />
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
          <label className="block text-sm font-medium mb-1.5" htmlFor="a11y-page-11">
            كود مضمّن{" "}
            <span className="text-neutral-400">
              (اختياري — YouTube / Vimeo / TikTok فقط، يُعرض بدل الصورة)
            </span>
          </label>
          <textarea
            name="embedHtml"
            className="input min-h-20 py-3 font-mono text-xs"
            dir="ltr"
            placeholder='<iframe src="https://www.youtube.com/embed/..." ...></iframe>'
            id="a11y-page-11"
          />
        </div>
        <button className="btn-primary">حفظ ونشر</button>
      </AdminActionForm>

      {/* list */}
      <div className="grid gap-4">
        {banners.map((b) => {
          const embedUrl = safeBannerEmbedUrl(b.embedHtml);
          return (
            <div key={b.id} className="card overflow-hidden">
              {embedUrl ? (
                <iframe
                  src={embedUrl}
                  title={b.title}
                  sandbox="allow-scripts allow-same-origin allow-presentation"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  referrerPolicy="strict-origin-when-cross-origin"
                  className="w-full aspect-4/1 border-0 bg-neutral-100"
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={publicAsset(b.imageUrl ?? "")}
                  alt={b.title}
                  className="w-full aspect-4/1 object-cover"
                />
              )}
              <details className="p-4">
                <summary className="cursor-pointer font-bold">تعديل البانر</summary>
                <AdminActionForm action={updateBannerAction} className="space-y-3 mt-3">
                  <input type="hidden" name="bannerId" value={b.id} />
                  <label className="block">
                    العنوان
                    <input
                      name="title"
                      className="input"
                      defaultValue={b.title}
                      required
                      maxLength={120}
                    />
                  </label>
                  <label className="block">
                    الموضع
                    <select
                      name="position"
                      className="input"
                      defaultValue={Object.hasOwn(POSITIONS, b.position) ? b.position : "HOME_TOP"}
                    >
                      {Object.entries(POSITIONS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!Object.hasOwn(POSITIONS, b.position) && (
                    <p className="text-amber-700">
                      الموضع السابق غير مدعوم؛ اختر موضعًا ظاهرًا في الرئيسية.
                    </p>
                  )}
                  <label className="block">
                    الوجهة
                    <input name="linkUrl" className="input" defaultValue={b.linkUrl ?? ""} />
                  </label>
                  <BannerImageField defaultUrl={b.imageUrl ?? ""} />
                  <BannerImageField
                    name="mobileImageUrl"
                    label="صورة الهاتف"
                    ratio={2}
                    defaultUrl={b.mobileImageUrl ?? ""}
                  />
                  <label className="block">
                    رابط تضمين YouTube / Vimeo / TikTok
                    <textarea name="embedHtml" className="input" defaultValue={b.embedHtml ?? ""} />
                  </label>
                  <button className="btn-primary">حفظ التعديل</button>
                </AdminActionForm>
              </details>
              <div className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-bold">{b.title}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {POSITIONS[b.position] ?? b.position} · {b.clicks} نقرة
                    {b.mobileImageUrl && <span className="mr-2">· 📱 نسخة للهاتف</span>}
                    {b.linkUrl && (
                      <span dir="ltr" className="mr-2">
                        → {b.linkUrl}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`badge ${b.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}
                  >
                    {b.status === "ACTIVE" ? "نشط" : "معطل"}
                  </span>
                  <AdminActionForm action={toggleBannerAction}>
                    <input type="hidden" name="bannerId" value={b.id} />
                    <button className="badge bg-neutral-800 text-white cursor-pointer hover:bg-neutral-700">
                      {b.status === "ACTIVE" ? "تعطيل" : "تفعيل"}
                    </button>
                  </AdminActionForm>
                  <AdminActionForm action={deleteBannerAction} confirm="حذف البانر نهائيًا؟">
                    <input type="hidden" name="bannerId" value={b.id} />
                    <button className="badge bg-red-600 text-white cursor-pointer hover:bg-red-700">
                      حذف
                    </button>
                  </AdminActionForm>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
