import { Coins, Plus, Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { timeAgo } from "@/lib/utils";
import { RechargePackages } from "./RechargePackages";

export const dynamic = "force-dynamic";

export const metadata = { title: "محفظة النقاط" };

export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ promoError?: string }>;
}) {
  const user = await requireUser();
  const { promoError } = await searchParams;

  const [packages, ledger] = await Promise.all([
    db.pointPackage.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.pointTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="section-title flex items-center gap-2">
        <Wallet className="size-6 text-primary-500" />
        محفظة النقاط
      </h1>

      {/* balance */}
      <div className="rounded-2xl bg-gradient-to-l from-primary-600 to-primary-500 text-white p-6 flex items-center justify-between">
        <div>
          <p className="text-primary-100 text-sm">رصيدك الحالي</p>
          <p className="font-display font-extrabold text-4xl mt-1 flex items-center gap-2">
            <Coins className="size-8" />
            {user.points.toLocaleString("en-US")}
          </p>
        </div>
        <p className="text-primary-100 text-xs max-w-40 leading-relaxed">
          استخدم نقاطك لتمييز إعلاناتك أو إطلاق حملات إعلانية مستهدفة
        </p>
      </div>

      {/* recharge packages */}
      <div>
        <h2 className="font-bold mb-3 flex items-center gap-2">
          <Plus className="size-5 text-primary-500" />
          شحن النقاط
        </h2>
        <RechargePackages
          packages={packages.map((p) => ({
            id: p.id,
            points: p.points,
            bonus: p.bonus,
            price: p.price,
          }))}
          promoError={promoError}
        />
        <p className="text-xs text-neutral-400 mt-2">
          الدفع الآمن عبر مدى / Visa / Apple Pay بواسطة Moyasar — يُضاف على السعر
          ضريبة القيمة المضافة 15%، وتُضاف النقاط فور تأكيد الدفع.
        </p>
        <p className="text-xs text-neutral-400 mt-1">
          الباقات والأسعار قابلة للتغيير من إدارة حراج ستيشن في أي وقت.
        </p>
      </div>

      {/* ledger */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100 font-bold text-sm">سجل النقاط</div>
        {ledger.length === 0 ? (
          <p className="px-4 py-6 text-sm text-neutral-400 text-center">لا توجد حركات بعد</p>
        ) : (
          <ul className="divide-y divide-neutral-50">
            {ledger.map((tx) => (
              <li key={tx.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                <span className="text-neutral-600 line-clamp-1">{tx.reason}</span>
                <span className="flex items-center gap-3 shrink-0">
                  <span className={tx.delta >= 0 ? "text-success font-bold" : "text-danger font-bold"}>
                    {tx.delta > 0 ? `+${tx.delta}` : tx.delta}
                  </span>
                  <span className="text-xs text-neutral-400 w-16 text-left" suppressHydrationWarning>
                    {timeAgo(tx.createdAt)}
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
