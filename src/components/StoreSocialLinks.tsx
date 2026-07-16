import { Globe } from "lucide-react";

/**
 * Social icon row on the public store page. Brand glyphs are inline SVGs
 * (lucide ships no TikTok/Snapchat/WhatsApp marks). Renders nothing when the
 * store has no links.
 */

type Links = {
  website: string | null;
  twitter: string | null;
  instagram: string | null;
  tiktok: string | null;
  snapchat: string | null;
  youtube: string | null;
  whatsapp: string | null;
};

const glyph = (d: string) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="size-4.5" aria-hidden>
    <path d={d} />
  </svg>
);

const X_ICON = glyph(
  "M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.15h7.59l5.24 6.93zm-1.29 19.5h2.04L6.49 3.24H4.3z"
);
const INSTAGRAM_ICON = glyph(
  "M12 2.16c3.2 0 3.58.01 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.64.07-4.85.07s-3.58-.01-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92-.06-1.27-.07-1.64-.07-4.85s.01-3.58.07-4.85C2.38 3.92 3.9 2.38 7.15 2.23 8.42 2.18 8.8 2.16 12 2.16M12 0C8.74 0 8.33.01 7.05.07 2.7.27.27 2.69.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.2 4.36 2.62 6.78 6.98 6.98C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c4.35-.2 6.78-2.62 6.98-6.98.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.2-4.35-2.62-6.78-6.98-6.98C15.67.01 15.26 0 12 0m0 5.84A6.16 6.16 0 1 0 18.16 12 6.16 6.16 0 0 0 12 5.84m0 10.15A4 4 0 1 1 16 12a4 4 0 0 1-4 4m6.41-11.85a1.44 1.44 0 1 0 1.43 1.44 1.44 1.44 0 0 0-1.43-1.44"
);
const TIKTOK_ICON = glyph(
  "M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.9 2.9 0 1 1-2.9-2.9 2.86 2.86 0 0 1 .85.13V9.4a6.33 6.33 0 0 0-.85-.05 6.34 6.34 0 1 0 6.34 6.34V8.66a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-.99-.09"
);
const SNAPCHAT_ICON = glyph(
  "M12.03.68c1.1 0 4.83.3 6.6 4.24.59 1.33.45 3.58.33 5.39l-.01.31c-.01.2-.02.38-.03.56.09.05.24.1.47.1.35-.02.75-.12 1.19-.32.18-.08.37-.1.51-.1.21 0 .43.04.6.11.51.18.84.55.85.94.01.5-.44.93-1.34 1.29-.1.04-.23.08-.36.12-.47.15-1.18.37-1.37.83-.1.24-.06.54.12.9l.01.02c.06.11 1.53 2.9 4.78 3.44.26.04.44.27.42.53a.75.75 0 0 1-.06.23c-.24.57-1.27.98-3.14 1.27-.06.09-.12.38-.17.58-.04.19-.08.38-.14.58-.07.26-.26.4-.53.4h-.03c-.13 0-.31-.03-.54-.07a6.2 6.2 0 0 0-1.28-.14c-.3 0-.6.02-.91.08-.6.1-1.11.46-1.7.88-.85.6-1.8 1.28-3.26 1.28l-.19-.01-.13.01c-1.45 0-2.41-.68-3.25-1.28-.59-.42-1.1-.78-1.7-.88a5.6 5.6 0 0 0-.91-.08c-.53 0-.95.08-1.28.15-.22.04-.4.08-.54.08-.35 0-.49-.21-.55-.4-.06-.2-.1-.4-.14-.59-.05-.2-.11-.5-.17-.58-1.87-.29-2.9-.7-3.14-1.28a.74.74 0 0 1-.06-.22.5.5 0 0 1 .42-.53c3.25-.54 4.7-3.33 4.77-3.44l.02-.03c.18-.35.22-.65.12-.89-.19-.46-.9-.68-1.37-.83-.13-.04-.25-.08-.36-.12-1.2-.48-1.36-1.02-1.29-1.4.1-.51.73-.86 1.26-.86.16 0 .29.03.41.08.47.22.89.34 1.25.34.28 0 .45-.07.54-.12l-.04-.87c-.12-1.81-.26-4.05.33-5.38C7.21.99 10.92.69 12.02.69z"
);
const YOUTUBE_ICON = glyph(
  "M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81zM9.55 15.57V8.43L15.82 12l-6.27 3.57z"
);
const WHATSAPP_ICON = glyph(
  "M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.47-2.4-1.48-.88-.79-1.48-1.76-1.66-2.06-.17-.3-.02-.46.13-.6.14-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.5 0 1.47 1.07 2.9 1.22 3.1.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.42.25-.7.25-1.3.18-1.42-.08-.13-.28-.2-.57-.35m-5.42 7.4h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.9-9.88a9.83 9.83 0 0 1 6.99 2.9 9.82 9.82 0 0 1 2.9 7 9.9 9.9 0 0 1-9.9 9.87M20.47 3.6A11.8 11.8 0 0 0 12.05 0C5.5 0 .16 5.33.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.9 11.9 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.33 11.89-11.89 0-3.18-1.24-6.16-3.47-8.4"
);

export function StoreSocialLinks({ links }: { links: Links }) {
  const items: { key: string; href: string; label: string; icon: React.ReactNode }[] = [];
  if (links.twitter) items.push({ key: "x", href: links.twitter, label: "X", icon: X_ICON });
  if (links.instagram)
    items.push({ key: "instagram", href: links.instagram, label: "إنستغرام", icon: INSTAGRAM_ICON });
  if (links.tiktok)
    items.push({ key: "tiktok", href: links.tiktok, label: "تيك توك", icon: TIKTOK_ICON });
  if (links.snapchat)
    items.push({ key: "snapchat", href: links.snapchat, label: "سناب شات", icon: SNAPCHAT_ICON });
  if (links.youtube)
    items.push({ key: "youtube", href: links.youtube, label: "يوتيوب", icon: YOUTUBE_ICON });
  if (links.whatsapp)
    items.push({
      key: "whatsapp",
      href: `https://wa.me/${links.whatsapp}`,
      label: "واتساب",
      icon: WHATSAPP_ICON,
    });
  if (links.website)
    items.push({
      key: "website",
      href: links.website,
      label: "الموقع الإلكتروني",
      icon: <Globe className="size-4.5" />,
    });
  if (items.length === 0) return null;

  return (
    <div className="flex items-center gap-2 justify-center sm:justify-start">
      {items.map(({ key, href, label, icon }) => (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          title={label}
          aria-label={label}
          className="size-9 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
        >
          {icon}
        </a>
      ))}
    </div>
  );
}
