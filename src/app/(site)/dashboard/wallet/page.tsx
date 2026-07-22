import { Coins, PauseCircle, Plus, Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getTopupConfig } from "@/lib/settings";
import { timeAgo } from "@/lib/utils";
import { RechargePackages } from "./RechargePackages";
import { getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.dash.wallet.title };
}

export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ promoError?: string }>;
}) {
  const user = await requireUser();
  const { lang, t } = await getT();
  const d = t.dash.wallet;
  const { promoError } = await searchParams;

  const [packages, ledger, topup] = await Promise.all([
    db.pointPackage.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.pointTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    getTopupConfig(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="section-title flex items-center gap-2">
        <Wallet className="size-6 text-primary-500" />
        {d.title}
      </h1>

      {/* balance */}
      <div className="rounded-2xl bg-gradient-to-l from-primary-600 to-primary-500 text-white p-6 flex items-center justify-between">
        <div>
          <p className="text-primary-100 text-sm">{d.balance}</p>
          <p className="font-display font-extrabold text-4xl mt-1 flex items-center gap-2">
            <Coins className="size-8" />
            {user.points.toLocaleString("en-US")}
          </p>
        </div>
        <p className="text-primary-100 text-xs max-w-40 leading-relaxed">
          {d.balanceHint}
        </p>
      </div>

      {/* recharge packages */}
      <div>
        <h2 className="font-bold mb-3 flex items-center gap-2">
          <Plus className="size-5 text-primary-500" />
          {d.recharge}
        </h2>
        {!topup.enabled ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5 flex items-start gap-3">
            <PauseCircle className="size-6 text-amber-500 shrink-0" />
            <p className="text-sm text-amber-900 leading-relaxed font-medium">{topup.message}</p>
          </div>
        ) : (
          <>
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
              {d.payNote}
            </p>
            <p className="text-xs text-neutral-400 mt-1">
              {d.pricesNote}
            </p>
          </>
        )}
      </div>

      {/* ledger */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100 font-bold text-sm">{d.ledger}</div>
        {ledger.length === 0 ? (
          <p className="px-4 py-6 text-sm text-neutral-400 text-center">{d.noTx}</p>
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
                    {timeAgo(tx.createdAt, lang)}
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
