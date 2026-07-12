# 📋 المطلوب منك لإكمال المنصة — حراج ستيشن

> سلّمني القيم المطلوبة في هذا الملف (أو ضعها في ملف `.env`) وسأكمل ربط كل خدمة وتشغيل المنصة كاملة.
> **مهم:** لا ترسل هذه المفاتيح في أي مكان عام — هي أسرار مثل كلمات المرور.

---

## 🟢 حالة الاستلام والربط (تحديث 2026-07-11 مساءً)

| الخدمة | الحالة |
|---|---|
| الدومين harajstation.com | ✅ مستلم ومضبوط في `NEXT_PUBLIC_SITE_URL` |
| Supabase PostgreSQL | ✅ **مربوط وشغال** — migrations + seed تمّا على القاعدة |
| Brevo SMTP (البريد) | ✅ **مربوط** — «نسيت كلمة المرور» وتأكيد البريد يرسلان عبر SMTP (يتبقى: توثيق الدومين في لوحة Brevo — أضف سجلات DKIM/SPF في Spaceship) |
| Moyasar (الدفع) | ✅ **مربوط** — فواتير + ضريبة 15% + صفحة تأكيد + webhook (يتبقى: ضبط الـ webhook في لوحة Moyasar — انظر أدناه) |
| Cloudflare R2 | ✅ **مربوط ومختبَر** — رفع فعلي + قراءة من الرابط العام نجحا (2026-07-12) |
| AUTH_SECRET / CRON_SECRET | ✅ مولّدة ومضبوطة في `.env` |

### المطلوب لتفعيل webhook الدفع (خطوة واحدة)
لوحة Moyasar → Settings → Webhooks → أضف endpoint:
`https://harajstation.com/api/payments/webhook` — وانسخ الـ Secret Token اللي تولّده وضعه في `.env` تحت `MOYASAR_WEBHOOK_SECRET`.

### ⚠️ تنبيه أمني
المفاتيح أُرسلت في المحادثة — بعد اكتمال الإعداد أنصح بتدوير (rotate) مفتاح Moyasar السري ومفتاح R2 من لوحتيهما، وتحديث `.env`.

---

## 1️⃣ الدومين والاستضافة (الأولوية القصوى)

| المطلوب | من أين | ما تسلّمه لي |
|---|---|---|
| دومين | Namecheap / GoDaddy / أي مسجّل | اسم الدومين (مثال: `harajstation.com`) |
| استضافة | خيار أ: **Vercel** (الأسهل — أرشحه)<br>خيار ب: سيرفر VPS (Hetzner CPX31 أو ما يعادله) | Vercel: دعوة للمشروع أو ربط GitHub<br>VPS: عنوان IP + مفتاح SSH |
| Cloudflare (مجاني) | cloudflare.com — أضف الدومين وغيّر الـ nameservers | إيميل الحساب (سأرشدك للإعدادات) |

**بعد توفر الدومين مباشرة أرسله لي** — سأضبط: `NEXT_PUBLIC_SITE_URL` (جاهز في الكود للـ SEO والـ sitemap).

---

## 2️⃣ قاعدة البيانات PostgreSQL

سجّل في **واحد** من هذين (كلاهما فيه خطة مجانية تكفي للبداية):

- **Neon** — neon.tech (أرشحه — سريع وبسيط)
- **Supabase** — supabase.com

**ما تسلّمه لي:** رابط الاتصال (Connection String) — يبدأ بـ `postgresql://...`

```
DATABASE_URL="postgresql://user:pass@host/dbname?sslmode=require"
```

سأتولى: تحويل الـ schema من SQLite إلى PostgreSQL + إنشاء migrations حقيقية + نقل البيانات.

---

## 3️⃣ تخزين الصور — Cloudflare R2

من نفس حساب Cloudflare: **R2 Object Storage** → أنشئ Bucket باسم `haraj-uploads`.

**ما تسلّمه لي:**
```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=haraj-uploads
R2_PUBLIC_URL=        ← رابط الـ bucket العام (أو نفعّل custom domain)
```

سأتولى: تحويل كل الرفع (إعلانات، أفاتار، متاجر، شات) من القرص المحلي إلى R2.

---

## 4️⃣ بوابة الدفع — Moyasar (أو Tap)

سجّل منشأتك في **moyasar.com** (يتطلب سجل تجاري أو معروف/وثيقة عمل حر).

**ما تسلّمه لي:**
```
MOYASAR_PUBLISHABLE_KEY=pk_live_...
MOYASAR_SECRET_KEY=sk_live_...
```
(في البداية أرسل مفاتيح الـ test: `pk_test_` / `sk_test_` وسأبني الربط عليها ثم نبدّل)

سأتولى: صفحة الدفع + شحن النقاط الحقيقي + ضريبة 15% + الفواتير + webhooks التأكيد.

---

## 5️⃣ البريد الإلكتروني — Brevo (SMTP)

✅ **تم الربط** — سجّلت في **brevo.com** وسلّمت مفتاح SMTP. المتبقي: **توثيق الدومين harajstation.com** في لوحة Brevo (Senders & Domains → Domains) وإضافة سجلات DNS (DKIM/SPF) في Spaceship حتى لا تذهب الرسائل للسبام.

**القيم المستخدمة:**
```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=b1bc85001@smtp-brevo.com
SMTP_PASS=xsmtpsib-...
MAIL_FROM="حراج ستيشن <noreply@harajstation.com>"
MAIL_REPLY_TO="support@harajstation.com"
```

**توزيع العناوين الرسمية:**

| الصندوق | الاستخدام |
|---|---|
| `noreply@harajstation.com` | المرسل الرسمي لكل رسائل النظام (تأكيد البريد، استعادة كلمة المرور) |
| `support@harajstation.com` | دعم المستخدمين — يظهر في صفحة «تواصل معنا» وذيل كل رسالة، والرد على رسائل النظام يصل إليه (Reply-To) |
| `help@harajstation.com` | استفسارات الخصوصية وحقوق البيانات — مذكور في سياسة الخصوصية |
| `admin@harajstation.com` | المراسلات الإدارية والتسجيل في الخدمات الخارجية (Moyasar، Brevo، Google...) |

سأتولى: «نسيت كلمة المرور» بالبريد الحقيقي + تأكيد البريد عند التسجيل + إشعارات مهمة.

---

## 6️⃣ رسائل SMS (تحقق الجوال) — Msegat أو Unifonic

سجّل في **msegat.com** (الأسهل للسعودية) واطلب Sender Name (يتطلب سجل تجاري/معروف).

**ما تسلّمه لي:**
```
MSEGAT_USERNAME=
MSEGAT_API_KEY=
MSEGAT_SENDER=       ← اسم المرسل المعتمد
```

سأتولى: OTP للتحقق من الجوال + تفعيل `phoneVerified` + اشتراط التحقق للمزادات.

---

## 7️⃣ دخول Google (OAuth)

من **console.cloud.google.com**:
1. أنشئ مشروعاً جديداً
2. APIs & Services → OAuth consent screen → External → عبّي اسم التطبيق والدومين
3. Credentials → Create OAuth Client ID → Web application
4. أضف في Authorized redirect URIs: `https://yourdomain.com/api/auth/social/google/callback`

**ما تسلّمه لي:**
```
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

سأتولى: OAuth الحقيقي كاملاً (الكود جاهز للتبديل — زر Google موجود ويتحول تلقائياً من الوضع التجريبي فور وجود المفاتيح). *(أزلنا Apple وX بناءً على طلبك)*

---

## 8️⃣ مراقبة الأخطاء — Sentry (اختياري لكن موصى به بشدة)

سجّل في **sentry.io** (مجاني) → أنشئ مشروع Next.js.

**ما تسلّمه لي:**
```
SENTRY_DSN=https://...@....ingest.sentry.io/...
```

---

## 9️⃣ أسرار تولّدها بنفسك (لا تسجيل — دقيقة واحدة)

شغّل هذين الأمرين في أي terminal وأرسل لي الناتج (أو ضعه في `.env` مباشرة):

```bash
# AUTH_SECRET — مفتاح الجلسات (إلزامي، الموقع لن يعمل في الإنتاج بدونه)
node -e "console.log('AUTH_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"

# CRON_SECRET — مفتاح نقطة الـ cron الجديدة /api/cron
node -e "console.log('CRON_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

---

## ✅ ما أنجزته بالفعل بدون الحاجة لأي تسجيل (2026-07-11)

- **الأمان**: فرض `AUTH_SECRET` قوي في الإنتاج، security headers كاملة (CSP/HSTS/nosniff/frame)، rate limiting على تسجيل الدخول/التسجيل/نسيت كلمة المرور/المزايدات/الرسائل/الرفع، فحص الصور بالـ magic bytes، ضغط وتحويل كل الصور المرفوعة إلى WebP تلقائياً، إخفاء بيانات الحسابات التجريبية من صفحة الدخول
- **توثيق الهوية**: المستخدم يرفع صورة هويته من الإعدادات (تُحفظ في مجلد خاص غير مكشوف للويب) → الأدمن يراجع من `/admin/identity` ويوافق/يرفض → شارة «موثّق» تظهر على البروفايل وكارت البائع + إشعار للمستخدم
- **حذف الحساب (PDPL)**: من الإعدادات بتأكيد كلمة المرور — يمسح البيانات الشخصية ويُخفي الإعلانات ويلغي الحملات
- **Cron جاهز**: `/api/cron` ينهي المزادات والحملات والمعاملات المعلقة (يُستدعى كل دقيقة بمفتاح `CRON_SECRET`)
- **SEO**: `robots.txt` + `sitemap.xml` ديناميكي (إعلانات/مزادات/فئات/متاجر) + Open Graph وTwitter cards وProduct JSON-LD لصفحات الإعلانات
- **الدخول الاجتماعي**: Google فقط (أُزيل Apple وX)
- ملاحظة: إرفاق الصور في المحادثات كان موجوداً بالفعل — والآن يمر عبر الفحص والضغط الجديد

## 🔜 ما سأنفذه فور استلام كل مفتاح

| المفتاح | ما يتفعّل به |
|---|---|
| `DATABASE_URL` | PostgreSQL + migrations + نقل البيانات |
| مفاتيح R2 | الصور على تخزين سحابي دائم + CDN |
| مفاتيح Moyasar | شحن نقاط حقيقي + فواتير + ضريبة |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | استعادة كلمة المرور بالبريد + تأكيد البريد (Brevo) |
| مفاتيح Msegat | OTP الجوال + `phoneVerified` |
| مفاتيح Google | دخول Google حقيقي |
| `SENTRY_DSN` | تتبع الأخطاء |
| الدومين | SEO كامل + HTTPS + PWA بشكل صحيح |
