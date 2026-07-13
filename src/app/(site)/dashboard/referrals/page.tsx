import { Coins, Gift, UserPlus, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getOrCreateReferralCode, getReferralConfig } from "@/lib/referral";
import { timeAgo } from "@/lib/utils";
import { CopyField } from "./CopyField";

export const dynamic = "force-dynamic";

export const metadata = { title: "دعوة الأصدقاء" };

export default async function ReferralsPage() {
  const user = await requireUser();
  const [code, config] = await Promise.all([
    getOrCreateReferralCode(user.id),
    getReferralConfig(),
  ]);

  const [referralsCount, earnedAgg, earnings] = await Promise.all([
    db.user.count({ where: { referredById: user.id } }),
    db.referralEarning.aggregate({
      where: { referrerId: user.id },
      _sum: { points: true },
    }),
    db.referralEarning.findMany({
      where: { referrerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { referred: { select: { name: true } } },
    }),
  ]);
  const totalEarned = earnedAgg._sum.points ?? 0;

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const shareLink = `${site}/register?ref=${code}`;

  return (
    <div className="space-y-6">
      <h1 className="section-title flex items-center gap-2">
        <UserPlus className="size-6 text-primary-500" />
        دعوة الأصدقاء
      </h1>

      {/* hero: how it works */}
      <div className="rounded-2xl bg-gradient-to-l from-primary-600 to-primary-500 text-white p-6 space-y-2">
        <p className="font-display font-extrabold text-2xl flex items-center gap-2">
          <Gift className="size-6" />
          ادعُ أصدقاءك واكسب نقاطاً
        </p>
        <p className="text-primary-100 text-sm leading-relaxed max-w-lg">
          {config.enabled
            ? `شارك كودك مع أصدقائك — كل ما صديق سجّل بكودك وشحن نقاطاً، تحصل أنت تلقائياً على ${config.percent}% من قيمة شحنته نقاطاً في رصيدك. بدون حد أقصى!`
            : "برنامج الإحالة متوقف مؤقتاً — كودك محفوظ وستُحتسب مكافآتك عند إعادة تفعيله."}
        </p>
      </div>

      {/* code + link */}
      <div className="card p-5 space-y-4">
        <CopyField label="كود الإحالة الخاص بك" value={code} />
        <CopyField label="رابط الدعوة المباشر (يعبّي الكود تلقائياً)" value={shareLink} />
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4 text-center">
          <Users className="size-6 text-primary-500 mx-auto mb-1" />
          <p className="font-display font-extrabold text-3xl">{referralsCount.toLocaleString("en-US")}</p>
          <p className="text-xs text-neutral-500 mt-1">أصدقاء انضموا بكودك</p>
        </div>
        <div className="card p-4 text-center">
          <Coins className="size-6 text-primary-500 mx-auto mb-1" />
          <p className="font-display font-extrabold text-3xl">{totalEarned.toLocaleString("en-US")}</p>
          <p className="text-xs text-neutral-500 mt-1">نقطة كسبتها من الإحالات</p>
        </div>
      </div>

      {/* earnings ledger */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100 font-bold text-sm">آخر مكافآت الإحالة</div>
        {earnings.length === 0 ? (
          <p className="px-4 py-6 text-sm text-neutral-400 text-center">
            لا توجد مكافآت بعد — شارك كودك وابدأ الكسب!
          </p>
        ) : (
          <ul className="divide-y divide-neutral-50">
            {earnings.map((e) => (
              <li key={e.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                <span className="text-neutral-600 line-clamp-1">شحن {e.referred.name} رصيده</span>
                <span className="flex items-center gap-3 shrink-0">
                  <span className="text-success font-bold">+{e.points}</span>
                  <span className="text-xs text-neutral-400 w-16 text-left" suppressHydrationWarning>
                    {timeAgo(e.createdAt)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
