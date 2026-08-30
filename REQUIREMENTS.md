# متطلبات تشغيل حراج ستيشن

> آخر تحديث: 2026-08-30. لا تضع أي قيمة سرية في Git أو المحادثات أو هذا الملف.

## إلزامي في الإنتاج

| المتغير | الغرض |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | PostgreSQL عبر pooler واتصال migrations مباشر |
| `AUTH_SECRET` | جلسات الموقع والإدارة، عشوائي 32+ حرفًا |
| `CRON_SECRET` | حماية `/api/cron` |
| `CHAT_SECRET` | تشفير المحادثات، مستقل عن AUTH |
| `NEXT_PUBLIC_SITE_URL` | الرابط العام HTTPS |
| `ADMIN_HOST` | نطاق الإدارة المنفصل |
| `REDIS_URL` | rate limiting وlogin guard المشترك بين عاملي PM2 |
| `SMTP_*`, `MAIL_FROM` | تحقق البريد وreset و2FA؛ المصادقة تفشل مغلقة بدونه |
| `BACKUP_AGE_RECIPIENT` | تشفير النسخ اليومية بمفتاح age عام |

## الصور والإشعارات

- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` للصور العامة.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` لـWeb Push.
- الوثائق ومرفقات المحادثات لا توضع في R2 العام؛ تُخدم عبر API مصادق.

## الدفع — مؤجل ومعطل

الإنتاج يبقى على `PAYMENTS_ENABLED=false` حتى اعتماد حساب البوابة واختبار webhook. عند التفعيل يلزم:

- `MOYASAR_PUBLISHABLE_KEY`
- `MOYASAR_SECRET_KEY`
- `MOYASAR_WEBHOOK_SECRET`
- endpoint: `https://harajstation.com/api/payments/webhook`

غياب أي إعداد لا يمنح نقاطًا تجريبية في production.

## اختياري

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` لدخول Google.
- `ANTHROPIC_API_KEY` لوصف الإعلانات بالذكاء الاصطناعي.
- `NEXT_PUBLIC_GA_ID` للتحليلات.
- `SENTRY_DSN` عند اعتماد مزود مراقبة.
- `BACKUP_REMOTE` لوجهة rclone خارجية.
- `CHAT_SECRET_PREVIOUS` لمفاتيح القراءة القديمة أثناء التدوير، ثم يزال بعد الترحيل.

راجع `.env.example` للقالب الكامل و`DEPLOY.md` للتشغيل والنسخ والاسترجاع.
