import { Handshake, Scale, ShieldCheck, Star, TimerReset } from "lucide-react";
import { TRUST_LEVELS } from "@/lib/constants";
import { getT } from "@/lib/i18n";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.trustPage.title };
}

export default async function TrustPage() {
  const { lang, t } = await getT();
  const d = t.trustPage;
  return (
    <div className="container-page py-12 pb-16 max-w-3xl space-y-8">
      <div className="text-center space-y-3">
        <span className="size-14 rounded-2xl bg-primary-500 text-white inline-flex items-center justify-center">
          <ShieldCheck className="size-7" />
        </span>
        <h1 className="font-display font-extrabold text-3xl">{d.title}</h1>
        <p className="text-neutral-500">
          {d.sub}
        </p>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <Handshake className="size-5 text-primary-500" />
          {d.howTitle}
        </h2>
        <ol className="space-y-3 text-sm text-neutral-700 list-decimal pr-5 leading-relaxed">
          <li>{d.s1a}<b>{d.s1b}</b>{d.s1c}</li>
          <li>{d.s2}</li>
          <li>{d.s3a}<b className="text-success">{d.s3b}</b>{d.s3c}</li>
          <li>{d.s4}</li>
          <li>{d.s5a}<b className="text-danger">{d.s5b}</b>{d.s5c}</li>
        </ol>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="card p-5 space-y-2">
          <TimerReset className="size-6 text-amber-500" />
          <p className="font-bold">{d.ignoreTitle}</p>
          <p className="text-sm text-neutral-600 leading-relaxed">
            {d.ignore1}<b>{d.ignore2}</b>{d.ignore3}<b>{d.ignore4}</b>{d.ignore5}
          </p>
        </div>
        <div className="card p-5 space-y-2">
          <Scale className="size-6 text-red-500" />
          <p className="font-bold">{d.disputeTitle}</p>
          <p className="text-sm text-neutral-600 leading-relaxed">
            {d.dispute1}<b>+5</b>{d.dispute2}<b>-15</b>{d.dispute3}
          </p>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <Star className="size-5 text-amber-500 fill-current" />
          {d.levelsTitle}
        </h2>
        <ul className="space-y-2 text-sm">
          {[
            ["81 – 100", TRUST_LEVELS[0]],
            ["61 – 80", TRUST_LEVELS[1]],
            ["41 – 60", TRUST_LEVELS[2]],
            ["21 – 40", TRUST_LEVELS[3]],
            ["0 – 20", TRUST_LEVELS[4]],
          ].map(([range, lvl]) => {
            const level = lvl as (typeof TRUST_LEVELS)[number];
            const label = lang === "en" ? level.labelEn : level.label;
            const color = level.color;
            return (
            <li key={label} className="flex items-center gap-3">
              <span className="w-20 tabular-nums text-neutral-500" dir="ltr">{range as string}</span>
              <span className="h-2 flex-1 rounded-full" style={{ backgroundColor: `${color}33` }}>
                <span className="block h-full w-full rounded-full" style={{ backgroundColor: color, opacity: 0.85 }} />
              </span>
              <span className="font-bold w-20" style={{ color }}>{label}</span>
            </li>
            );
          })}
        </ul>
        <p className="text-xs text-neutral-400">
          {d.startNote}
        </p>
      </div>
    </div>
  );
}
