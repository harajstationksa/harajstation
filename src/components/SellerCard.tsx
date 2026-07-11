import Link from "next/link";
import type { User } from "@prisma/client";
import { BadgeCheck, MessageCircle, Phone, ShieldAlert } from "lucide-react";
import { getT } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import { Avatar } from "./Avatar";
import { CredibilityBadge } from "./CredibilityBadge";

export async function SellerCard({
  seller,
  showContact,
  phone,
  whatsapp,
  contactNote,
}: {
  seller: User;
  showContact: boolean;
  phone?: string | null;
  whatsapp?: string | null;
  contactNote?: string;
}) {
  const { lang, t } = await getT();
  return (
    <div className="card p-4 space-y-3">
      <p className="font-bold text-sm text-neutral-500">{t.seller.info}</p>
      <div className="flex items-center gap-3">
        <Avatar name={seller.name} color={seller.avatarColor} src={seller.avatarUrl} pro={seller.isPro} className="size-12 text-lg" />
        <div className="min-w-0">
          <Link
            href={`/profile/${seller.id}`}
            className="font-bold text-neutral-900 hover:text-primary-600 transition-colors flex items-center gap-1.5"
          >
            {seller.name}
          </Link>
          <p className="text-xs text-neutral-400">
            {t.seller.memberSince} {formatDate(seller.createdAt, lang)} · {seller.city}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {seller.idVerified && (
          <span className="badge bg-green-50 text-green-700" title="هوية موثّقة من إدارة المنصة">
            <BadgeCheck className="size-3.5" />
            {lang === "en" ? "Verified" : "موثّق"}
          </span>
        )}
        <CredibilityBadge score={seller.credibility} />
        <span className="badge bg-neutral-100 text-neutral-600">
          <BadgeCheck className="size-3.5" />
          {seller.successfulTx} {t.seller.deals}
        </span>
      </div>

      {showContact ? (
        <div className="grid grid-cols-2 gap-2 pt-1">
          {whatsapp && (
            <a
              href={`https://wa.me/${whatsapp.replace("+", "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn bg-green-600 text-white hover:bg-green-700"
            >
              <MessageCircle className="size-4" />
              {t.seller.whatsapp}
            </a>
          )}
          {phone && (
            <a href={`tel:${phone}`} className="btn-secondary">
              <Phone className="size-4" />
              {t.seller.call}
            </a>
          )}
        </div>
      ) : (
        contactNote && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800">
            <ShieldAlert className="size-4 shrink-0" />
            {contactNote}
          </p>
        )
      )}
    </div>
  );
}
