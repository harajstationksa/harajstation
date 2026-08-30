# نشر حراج ستيشن على السيرفر

- **السيرفر**: Contabo VPS — Ubuntu 24.04، 8GB RAM، 4 vCPU — على `169.58.10.211`
- **الدومين**: `harajstation.com` مسجّل في **Spaceship** (الـ DNS بيتظبط من هناك، مش من Contabo)
- **الستاك**: Nginx + PM2 + Certbot

قاعدة البيانات على Supabase والصور على Cloudflare R2 — الاتنين خارج السيرفر، فالسيرفر ده بيشغّل تطبيق Next بس.

---

## 1) اللي محتاجينه قبل ما نبدأ

| الحاجة | الحالة | ملاحظة |
|---|---|---|
| IP السيرفر + اسم المستخدم | **مطلوب منك** | مش سر — الباسورد هو السر، وده مش هيتكتب في أي مكان |
| مفتاح SSH على السيرفر | **مطلوب منك** | `ssh-keygen -t ed25519` ثم `ssh-copy-id root@IP` |
| ملف `.env` للإنتاج | عندك محلياً | هيتنقل بـ `scp` مباشرة — **متنسخوش في أي شات** |
| الدومين | متسجّل في Contabo | لسه محتاج DNS records (تحت) |
| بريد على الدومين | **إلزامي للمصادقة** | تحقق البريد وreset و2FA تفشل مغلقة عند تعطل SMTP |

---

## 2) سجلات الـ DNS (من لوحة **Spaceship** → Domains → harajstation.com → Advanced DNS)

```
A      @        169.58.10.211
A      www      169.58.10.211
```

ودول عشان الإيميلات ماتروحش في السبام (الدومين جديد، ومن غيرهم Brevo هيتحجب):

```
TXT    @              v=spf1 include:spf.brevo.com ~all
TXT    _dmarc         v=DMARC1; p=none; rua=mailto:support@harajstation.com
CNAME/TXT  (DKIM)     القيمة بتتاخد من لوحة Brevo → Senders & Domains → Authenticate
```

**البريد الوارد**: لازم خدمة بريد عشان `support@harajstation.com` يستقبل فعلاً (ودي العناوين المكتوبة في كل الإيميلات وفي سياسة الخصوصية). أرخص حل مضبوط: **Zoho Mail** (مجاني لدومين واحد) — هيدّيك سجلات MX تحطها في Spaceship. من غيره الرسايل هتخرج بس محدش هيقدر يرد عليك.

---

## 3) الخطوات على السيرفر

```bash
# مرة واحدة بس
bash deploy/setup-server.sh            # Node 22 + pm2 + nginx + ufw + swap + certbot

git clone https://github.com/harajstationksa/harajstation.git /var/www/harajstation
scp .env root@<IP>:/var/www/harajstation/.env     # من جهازك، مش من السيرفر

cd /var/www/harajstation
bash deploy/deploy.sh                  # npm ci → prisma generate → build → pm2

cp deploy/nginx/harajstation.conf /etc/nginx/sites-available/harajstation
ln -sf /etc/nginx/sites-available/harajstation /etc/nginx/sites-enabled/harajstation
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

certbot --nginx -d harajstation.com -d www.harajstation.com --redirect

cp deploy/haraj-cron.sh /usr/local/bin/ && chmod +x /usr/local/bin/haraj-cron.sh
cp deploy/cron.d-harajstation /etc/cron.d/harajstation
```

بعد أي تحديث بعد كده: `cd /var/www/harajstation && bash deploy/deploy.sh` وخلاص.

---

## 4) تغييرات لازمة في `.env` على السيرفر

| المفتاح | القيمة |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://harajstation.com` — **مهم**: القيم اللي بتبدأ بـ `NEXT_PUBLIC_` بتتحرق جوه الكود وقت الـ build، فلازم تكون مضبوطة **قبل** `npm run build`. لو سيبتها `localhost` هتلاقي روابط الإيميلات والدفع كلها غلط. |
| `AUTH_SECRET` / `CRON_SECRET` / `CHAT_SECRET` | أسرار عشوائية مستقلة؛ لا تعِد استخدام AUTH لتشفير المحادثات |
| `PAYMENTS_ENABLED` | `false` حتى اعتماد البوابة والـwebhook واختبارهما |
| `REDIS_URL` | `redis://127.0.0.1:6379` في إعداد السيرفر الحالي |
| `BACKUP_AGE_RECIPIENT` | مستلم age العام؛ احتفظ بالمفتاح الخاص خارج السيرفر |
| باقي المفاتيح | زي ما هي (Supabase / R2 / Moyasar / Brevo / VAPID) |

**Moyasar**: من لوحة التحكم بتاعتهم ضيف الويبهوك على
`https://harajstation.com/api/payments/webhook` وحط نفس `MOYASAR_WEBHOOK_SECRET` في خانة الـ secret token.

---

## 5) حاجات مقصودة في الإعداد — متغيّرهاش من غير ما تاخد بالك

1. **PM2 بعاملين (`instances: 2`)** وRedis إلزامي. `setup-server.sh` يثبته ويختبر `PONG`، والتطبيق يستخدم `REDIS_URL` لعدادات الحماية المشتركة.

2. **Nginx بيمسح هيدر `CF-Connecting-IP` وبيكتب `X-Real-IP` بـ `$remote_addr`**. التطبيق بيثق في الهيدرز دي عشان يعرف IP الزائر؛ لو Nginx مرّر قيمة جاية من العميل، أي مهاجم كان هيبعت IP وهمي في كل طلب ويتخطى **كل** الحدود. (عشان كده كمان مش مستخدمين `$proxy_add_x_forwarded_for` — دي بتضيف على اللي العميل ادّعاه.)
   لو نقلت الـ DNS لـ Cloudflare بعدين، فيه ملاحظة في آخر `deploy/nginx/harajstation.conf` بالتعديل المطلوب — ولازم تقفل السيرفر بحيث مايقبلش غير IPs بتاعة Cloudflare، وإلا الهيدر يبقى مزوّر برضه.

3. **الكرون كل دقيقة**. من غيره المزادات المنتهية مابتتقفلش إلا لما حد يفتح صفحة.

---

## 6) النسخ والاسترجاع

`deploy/backup.sh` ينشئ يوميًا ملف age مشفرًا يحتوي PostgreSQL custom dump و`private-uploads` وmanifest للـcommit، ويحتفظ بـ30 يومًا. إذا ضُبط `BACKUP_REMOTE` ينسخه عبر rclone خارج السيرفر. اختبر الاسترجاع دوريًا على قاعدة منفصلة ولا تفك نسخة إنتاج فوق القاعدة الحية.
