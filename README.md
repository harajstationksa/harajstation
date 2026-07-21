# حراج ستيشن — منصة الإعلانات المبوبة والمزادات السعودية

منصة سعودية للإعلانات المبوبة والمزادات المباشرة — **harajstation.com**

> 📕 **الدليل الشامل**: [PLATFORM.md](PLATFORM.md) — كل شيء عن المنصة والسيرفر ورحلة المستخدم والأوامر والأمان وخطة التوسع.

سوق عربي (RTL أولاً + إنجليزية) يجمع الإعلانات المبوبة مع نظام مزادات مباشر بمزايدة بالوكالة وحماية من القنص، ونظام مصداقية متبادل يحاسب الطرفين بعد كل معاملة، وحملات إعلانية ممولة بالنقاط.

## التقنيات

| الطبقة | التقنية |
|---|---|
| الواجهة | Next.js 16 (App Router) + React 19 + TypeScript strict + Tailwind CSS v4 |
| قاعدة البيانات | PostgreSQL (Supabase) عبر Prisma 6 + migrations |
| تخزين الصور | Cloudflare R2 (S3 API) — ضغط وتحويل WebP تلقائي + فحص magic bytes |
| المدفوعات | Moyasar (فواتير + ضريبة 15% + webhook) |
| البريد | Brevo SMTP (استعادة كلمة المرور + تأكيد البريد) |
| الإشعارات | Web Push (VAPID) + PWA |
| الأمان | جلسات JWT (jose) بكوكيز HttpOnly + bcrypt + rate limiting + security headers + تشفير المحادثات عند التخزين (AES-256-GCM) |

## التشغيل محلياً

```bash
npm install
cp .env.example .env    # واملأ القيم — انظر REQUIREMENTS.md
npx prisma migrate dev  # تطبيق الـ migrations
npm run db:seed         # بيانات تجريبية (اختياري)
npm run dev             # http://localhost:3000
```

بدون مفاتيح الخدمات الخارجية يعمل المشروع بوضع تطوير كامل: الصور تُحفظ محلياً، رابط استعادة كلمة المرور يظهر على الشاشة، وشحن النقاط يُضاف مباشرة بدون دفع.

## متغيرات البيئة

انظر `REQUIREMENTS.md` للقائمة الكاملة وحالة كل خدمة. الأساسية:

```
DATABASE_URL / DIRECT_URL   # PostgreSQL (pgbouncer + session pooler)
AUTH_SECRET                 # 32+ حرفاً — إلزامي في الإنتاج
CRON_SECRET                 # مفتاح نقطة /api/cron
NEXT_PUBLIC_SITE_URL        # https://harajstation.com
R2_*                        # تخزين الصور
MOYASAR_*                   # الدفع
SMTP_* / MAIL_FROM          # البريد (Brevo SMTP)
NEXT_PUBLIC_VAPID_* / VAPID_* # إشعارات المتصفح
```

## أوامر مهمة

```bash
npm run build            # build إنتاجي
npx tsc --noEmit         # فحص الأنواع
npx prisma studio        # تصفح قاعدة البيانات
npx prisma migrate dev   # migration جديدة بعد تعديل الـ schema
```

## الإنتاج

- **Cron**: استدعِ `GET /api/cron` كل دقيقة مع `Authorization: Bearer $CRON_SECRET` (ينهي المزادات والحملات والمعاملات المعلقة)
- **Webhook الدفع**: `POST /api/payments/webhook` من لوحة Moyasar مع `MOYASAR_WEBHOOK_SECRET`
- خارطة الطريق الكاملة ومتطلبات الإطلاق: `ROADMAP.md`

---

© حراج ستيشن — جميع الحقوق محفوظة.
