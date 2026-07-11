import Link from "next/link";
import { Ghost, ShieldCheck } from "lucide-react";
import { getT } from "@/lib/i18n";
import { allSettings } from "@/lib/settings";

// brand icons (this lucide version ships no brand glyphs) — same outline style
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

export async function Footer() {
  const [{ t }, settings] = await Promise.all([getT(), allSettings()]);
  const f = t.footer;

  // admin-editable from /admin/banners — an empty link hides its icon
  const socials = [
    { icon: InstagramIcon, label: "Instagram", href: settings.SOCIAL_INSTAGRAM },
    { icon: FacebookIcon, label: "Facebook", href: settings.SOCIAL_FACEBOOK },
    { icon: Ghost, label: "Snapchat", href: settings.SOCIAL_SNAPCHAT },
  ].filter((s) => s.href);

  const columns: { title: string; links: [string, string][] }[] = [
    {
      title: f.market,
      links: [
        [f.liveAuctions, "/auctions"],
        [f.latestAds, "/listings"],
        [f.allCategories, "/categories"],
        [f.postYourAd, "/sell"],
      ],
    },
    {
      title: f.trending,
      links: [
        [f.vehicles, "/category/cars"],
        [f.realestate, "/category/realestate"],
        [f.electronics, "/category/electronics"],
        [f.animals, "/category/animals"],
      ],
    },
    {
      title: f.samel,
      links: [
        [f.pro, "/pro"],
        [f.trust, "/trust"],
        [f.terms, "/terms"],
        [f.privacy, "/privacy"],
        [f.contact, "/contact"],
      ],
    },
  ];

  return (
    <footer className="bg-neutral-900 text-neutral-300 mt-16 pb-28 md:pb-0">
      <div className="container-page py-12 grid grid-cols-2 md:grid-cols-5 gap-8">
        <div className="col-span-2 space-y-4">
          <div className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="حراج ستيشن" className="h-20 w-auto object-contain" />
          </div>
          <p className="text-sm text-neutral-400 leading-relaxed max-w-xs">{f.tagline}</p>
          {socials.length > 0 && (
            <div className="flex items-center gap-2">
              {socials.map(({ icon: Icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="size-9 rounded-full bg-neutral-800 hover:bg-primary-500 flex items-center justify-center transition-colors"
                >
                  <Icon className="size-4" />
                </a>
              ))}
            </div>
          )}
        </div>

        {columns.map((col) => (
          <div key={col.title}>
            <h4 className="font-bold text-white mb-3">{col.title}</h4>
            <ul className="space-y-2.5 text-sm">
              {col.links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-neutral-400 hover:text-primary-400 transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* trust strip */}
      <div className="border-t border-neutral-800">
        <div className="container-page py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-xs text-neutral-400">
            <ShieldCheck className="size-4 text-primary-400" />
            {f.safety}
          </p>
          <div className="flex items-center gap-2">
            {["مدى", "Apple Pay", "STC Pay", "Visa"].map((m) => (
              <span key={m} className="rounded-md bg-neutral-800 px-2.5 py-1 text-[11px] text-neutral-300">
                {m}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-neutral-800">
        <div className="container-page py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-neutral-500">
          <p>© {new Date().getFullYear()} حراج ستيشن — {f.rights}</p>
          <p>{f.disclaimer}</p>
        </div>
      </div>
    </footer>
  );
}
