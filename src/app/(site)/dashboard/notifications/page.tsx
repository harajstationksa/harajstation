import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  Gavel,
  MessageSquare,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { cn, timeAgo } from "@/lib/utils";
import { EmptyState } from "@/components/EmptyState";
import { PushManager } from "@/components/PushManager";
import { getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.dash.notifications.title };
}

const TYPE_ICON: Record<string, { icon: typeof Bell; cls: string }> = {
  BID: { icon: Gavel, cls: "bg-primary-50 text-primary-600" },
  OUTBID: { icon: Gavel, cls: "bg-red-50 text-red-600" },
  WON: { icon: Trophy, cls: "bg-green-50 text-green-600" },
  SOLD: { icon: Trophy, cls: "bg-green-50 text-green-600" },
  CONFIRM: { icon: ShieldCheck, cls: "bg-amber-50 text-amber-600" },
  DISPUTE: { icon: AlertTriangle, cls: "bg-red-50 text-red-600" },
  MESSAGE: { icon: MessageSquare, cls: "bg-blue-50 text-blue-600" },
  SYSTEM: { icon: Bell, cls: "bg-neutral-100 text-neutral-600" },
};

export default async function NotificationsPage() {
  const user = await requireUser();
  const { lang, t } = await getT();
  const d = t.dash.notifications;

  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // mark as read after fetching (so unread styling still shows this render)
  await db.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  return (
    <div className="space-y-5">
      <h1 className="section-title">{d.title}</h1>
      <PushManager />
      {notifications.length === 0 ? (
        <EmptyState title={d.emptyTitle} hint={d.emptyHint} />
      ) : (
        <div className="card overflow-hidden divide-y divide-neutral-50">
          {notifications.map((n) => {
            const { icon: Icon, cls } = TYPE_ICON[n.type] ?? TYPE_ICON.SYSTEM;
            const inner = (
              <div className="flex items-start gap-3 p-4">
                <span className={cn("size-9 rounded-xl flex items-center justify-center shrink-0", cls)}>
                  <Icon className="size-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm", !n.readAt ? "font-bold" : "font-medium")}>
                    {n.title}
                  </p>
                  <p className="text-sm text-neutral-500 mt-0.5 leading-relaxed">{n.body}</p>
                  <p className="text-xs text-neutral-400 mt-1" suppressHydrationWarning>
                    {timeAgo(n.createdAt, lang)}
                  </p>
                </div>
                {!n.readAt && <span className="size-2 rounded-full bg-primary-500 shrink-0 mt-2" />}
              </div>
            );
            return n.link ? (
              <Link key={n.id} href={n.link} className={cn("block hover:bg-neutral-50 transition-colors", !n.readAt && "bg-primary-50/40")}>
                {inner}
              </Link>
            ) : (
              <div key={n.id} className={cn(!n.readAt && "bg-primary-50/40")}>
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
