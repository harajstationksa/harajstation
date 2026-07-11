import { Mail, MessageCircle, Phone } from "lucide-react";
import { allSettings } from "@/lib/settings";
import { getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export const metadata = { title: "تواصل معنا" };

export default async function ContactPage() {
  // admin-editable from /admin/banners — an empty value hides its card
  const [settings, { t }] = await Promise.all([allSettings(), getT()]);
  const c = t.contact;
  const channels = [
    { icon: Mail, label: c.email, value: settings.CONTACT_EMAIL },
    { icon: Phone, label: c.phone, value: settings.CONTACT_PHONE },
    { icon: MessageCircle, label: c.whatsapp, value: settings.CONTACT_WHATSAPP },
  ].filter((ch) => ch.value);

  return (
    <div className="container-page py-12 pb-16 max-w-2xl space-y-8 text-center">
      <div className="space-y-3">
        <h1 className="font-display font-extrabold text-3xl">{c.title}</h1>
        <p className="text-neutral-500">{c.sub}</p>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        {channels.map(({ icon: Icon, label, value }) => (
          <div key={label} className="card p-5 space-y-2">
            <Icon className="size-6 text-primary-500 mx-auto" />
            <p className="font-bold text-sm">{label}</p>
            <p className="text-sm text-neutral-500" dir="ltr">{value}</p>
          </div>
        ))}
      </div>
      {settings.CONTACT_HOURS && (
        <p className="text-xs text-neutral-400">
          {c.hours} {settings.CONTACT_HOURS}
        </p>
      )}
    </div>
  );
}
