import { Handshake, Scale, ShieldCheck, Star, TimerReset } from "lucide-react";

export const metadata = { title: "نظام المصداقية" };

export default function TrustPage() {
  return (
    <div className="container-page py-12 pb-16 max-w-3xl space-y-8">
      <div className="text-center space-y-3">
        <span className="size-14 rounded-2xl bg-primary-500 text-white inline-flex items-center justify-center">
          <ShieldCheck className="size-7" />
        </span>
        <h1 className="font-display font-extrabold text-3xl">نظام المصداقية والتحقق المتبادل</h1>
        <p className="text-neutral-500">
          حراج ستيشن لا تتوسط مالياً بين البائع والمشتري — لذلك بنينا نظاماً يجعل الثقة
          قابلة للقياس، ويحاسب الطرفين بعد كل معاملة.
        </p>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <Handshake className="size-5 text-primary-500" />
          كيف يعمل التحقق المتبادل؟
        </h2>
        <ol className="space-y-3 text-sm text-neutral-700 list-decimal pr-5 leading-relaxed">
          <li>عند انتهاء مزاد بفائز (أو إتمام بيع)، تُفتح نافذة تأكيد لمدة <b>48 ساعة</b>.</li>
          <li>يُسأل البائع: «هل سلّمت المنتج؟» ويُسأل المشتري: «هل استلمت المنتج؟»</li>
          <li>إجابتان بـ«نعم» → معاملة مؤكدة و<b className="text-success">+5 نقاط للطرفين</b>.</li>
          <li>إجابتان بـ«لا» → إلغاء بالتراضي دون تأثير على النقاط.</li>
          <li>إجابتان متعارضتان → <b className="text-danger">نزاع</b> يراجعه فريق الدعم مع الإفادات والأدلة.</li>
        </ol>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="card p-5 space-y-2">
          <TimerReset className="size-6 text-amber-500" />
          <p className="font-bold">تجاهل التأكيد يكلفك</p>
          <p className="text-sm text-neutral-600 leading-relaxed">
            عدم الرد خلال المهلة يخصم <b>-3 نقاط</b>، وتجاهل الطرفين معاً يخصم
            <b> -5 نقاط</b> من كليهما.
          </p>
        </div>
        <div className="card p-5 space-y-2">
          <Scale className="size-6 text-red-500" />
          <p className="font-bold">النزاعات تُحسم بالأدلة</p>
          <p className="text-sm text-neutral-600 leading-relaxed">
            فريق الدعم يراجع الإفادات ويصدر قراراً: الطرف الصادق يكسب <b>+5</b>،
            والمخالف يخسر <b>-15 نقطة</b> وقد يُحظر عند التكرار.
          </p>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <Star className="size-5 text-amber-500 fill-current" />
          مستويات الثقة
        </h2>
        <ul className="space-y-2 text-sm">
          {[
            ["81 – 100", "ممتاز", "#16a34a"],
            ["61 – 80", "موثوق", "#65a30d"],
            ["41 – 60", "متوسط", "#eab308"],
            ["21 – 40", "مبتدئ", "#db7759"],
            ["0 – 20", "غير موثوق", "#dc2626"],
          ].map(([range, label, color]) => (
            <li key={label} className="flex items-center gap-3">
              <span className="w-20 tabular-nums text-neutral-500" dir="ltr">{range}</span>
              <span className="h-2 flex-1 rounded-full" style={{ backgroundColor: `${color}33` }}>
                <span className="block h-full w-full rounded-full" style={{ backgroundColor: color, opacity: 0.85 }} />
              </span>
              <span className="font-bold w-20" style={{ color }}>{label}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-neutral-400">
          كل حساب جديد يبدأ بـ50 نقطة. النقاط معروضة علناً في ملفك وفي كل إعلاناتك.
        </p>
      </div>
    </div>
  );
}
