import Link from "next/link";
import { Check, Crown, Gift } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getFreeTierConfig } from "@/lib/settings";
import { getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.proPage.title };
}

// Which plan is the signed-in user actually on?
function currentPlanKey(user: { isPro: boolean } | null) {
  if (!user) return null;
  return user.isPro ? "PRO_MONTHLY" : "FREE";
}

export default async function ProPage() {
  const { t } = await getT();
  const d = t.proPage;
  const [plans, user, freeTier] = await Promise.all([
    db.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    getCurrentUser(),
    getFreeTierConfig(),
  ]);
  const activeKey = currentPlanKey(user);

  return (
    <div className="container-page py-12 pb-16 space-y-10">
      <div className="text-center space-y-3">
        <span className="size-14 rounded-2xl bg-neutral-900 text-primary-400 inline-flex items-center justify-center">
          <Crown className="size-7" />
        </span>
        <h1 className="font-display font-extrabold text-3xl sm:text-4xl">{d.title}</h1>
        <p className="text-neutral-500 max-w-xl mx-auto">
          {d.sub}
        </p>
        {/* launch promo — visible while the admin free-tier switch is on */}
        {freeTier.enabled && (
          <div className="inline-flex items-center gap-2.5 text-sm font-semibold text-primary-700 bg-primary-50 border border-primary-100 rounded-xl px-4 py-3">
            <Gift className="size-5 shrink-0 text-primary-500" />
            <span>
              {d.promo(freeTier.days)}
              {!user && (
                <>
                  {" "}
                  <Link href="/register" className="underline font-bold">
                    {d.registerNow}
                  </Link>
                </>
              )}
            </span>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto items-stretch">
        {plans.map((plan) => {
          const features = JSON.parse(plan.features) as string[];
          const isCurrent = activeKey === plan.key;
          const isFree = plan.price === 0;

          // CTA: current plan → disabled label; guest → register/start; else → subscribe
          let ctaLabel: string;
          let ctaHref: string;
          if (isCurrent) {
            ctaLabel = d.current;
            ctaHref = "/dashboard";
          } else if (!user) {
            ctaLabel = isFree ? d.startFree : d.registerToSub;
            ctaHref = "/register";
          } else {
            ctaLabel = isFree ? d.backToFree : d.subscribe;
            ctaHref = "/dashboard";
          }

          return (
            <div
              key={plan.id}
              className={`card p-6 flex flex-col gap-4 ${
                isCurrent
                  ? "ring-2 ring-success relative"
                  : plan.highlight
                    ? "ring-2 ring-primary-500 relative"
                    : ""
              }`}
            >
              {isCurrent ? (
                <span className="badge bg-success text-white absolute -top-3 right-4">
                  {d.current}
                </span>
              ) : (
                plan.highlight && (
                  <span className="badge bg-primary-500 text-white absolute -top-3 right-4">
                    {d.popular}
                  </span>
                )
              )}
              <div>
                <p className="font-bold">{plan.name}</p>
                <p className="mt-2">
                  <span className="font-display font-extrabold text-4xl">{plan.price}</span>
                  <span className="text-neutral-500 text-sm">
                    {" "}{d.sar} {plan.period && `· ${plan.period}`}
                  </span>
                </p>
              </div>
              <ul className="space-y-2 text-sm flex-1">
                {features.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="size-4 text-success shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <span className="btn w-full bg-neutral-100 text-neutral-400 cursor-default">
                  {ctaLabel}
                </span>
              ) : (
                <Link
                  href={ctaHref}
                  className={plan.highlight ? "btn-primary w-full" : "btn-secondary w-full"}
                >
                  {ctaLabel}
                </Link>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-neutral-400 max-w-lg mx-auto">
        {d.payNote}
      </p>
      <p className="text-center text-xs text-neutral-400 max-w-lg mx-auto">
        {d.priceNote}
      </p>
    </div>
  );
}
