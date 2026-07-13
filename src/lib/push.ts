import webpush from "web-push";
import { db } from "./db";

/**
 * Web Push delivery. Every in-app notification (see notify.ts) is mirrored to
 * the user's subscribed browsers. Dead subscriptions (404/410 from the push
 * service) are pruned automatically. Failures never propagate — push is a
 * best-effort channel on top of the in-app inbox.
 */

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@harajstation.com",
    publicKey,
    privateKey
  );
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  link?: string;
};

/** Send a push notification to every subscribed browser of one user. */
export async function sendPush(userId: string, payload: PushPayload): Promise<void> {
  await sendPushMany([userId], payload);
}

/** Send a push notification to many users (deduplicated). */
export async function sendPushMany(userIds: string[], payload: PushPayload): Promise<void> {
  try {
    if (!ensureConfigured()) return;
    const ids = [...new Set(userIds)].filter(Boolean);
    if (ids.length === 0) return;
    const subs = await db.pushSubscription.findMany({
      where: { userId: { in: ids } },
    });
    if (subs.length === 0) return;

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      link: payload.link ?? "/dashboard/notifications",
      icon: "/icon.png",
    });

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            body
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            // subscription expired/revoked — drop it
            await db.pushSubscription
              .delete({ where: { id: sub.id } })
              .catch(() => {});
          }
        }
      })
    );
  } catch {
    // push must never break the calling flow
  }
}
