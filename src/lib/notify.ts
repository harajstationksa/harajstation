import { db } from "./db";
import { sendPush, sendPushMany } from "./push";

/**
 * Create an in-app notification AND mirror it to the user's browsers via Web
 * Push (best-effort). All notification producers go through here, so push
 * covers bids, outbids, wins, messages, campaign endings… automatically.
 */
export async function notify(
  userId: string,
  type: string,
  title: string,
  body: string,
  link?: string
) {
  await db.notification.create({ data: { userId, type, title, body, link } });
  await sendPush(userId, { title, body, link });
}

/** Same as notify() for a batch of users (one createMany + fanned-out push). */
export async function notifyMany(
  userIds: string[],
  type: string,
  title: string,
  body: string,
  link?: string
) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return;
  await db.notification.createMany({
    data: ids.map((userId) => ({ userId, type, title, body, link })),
  });
  await sendPushMany(ids, { title, body, link });
}
