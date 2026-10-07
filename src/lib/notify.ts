import { db } from "./db";
import type { Prisma } from "@prisma/client";

export async function notifyWithClient(
  tx: Prisma.TransactionClient,
  userIds: string[],
  type: string,
  title: string,
  body: string,
  link?: string,
  eventKey?: string,
) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return;
  const inserted = await tx.notification.createManyAndReturn({
    data: ids.map((userId) => ({
      userId,
      type,
      title,
      body,
      link,
      eventKey: eventKey ? `${eventKey}:${userId}` : null,
    })),
    skipDuplicates: true,
    select: { userId: true },
  });
  if (inserted.length)
    await tx.backgroundJob.create({
      data: {
        kind: "PUSH",
        payload: JSON.stringify({
          userIds: inserted.map((n) => n.userId),
          payload: { title, body, link },
        }),
      },
    });
}

/** Inbox delivery and durable push work commit together; requests never wait on a provider. */
export async function notify(
  userId: string,
  type: string,
  title: string,
  body: string,
  link?: string,
) {
  await notifyMany([userId], type, title, body, link);
}
export async function notifyMany(
  userIds: string[],
  type: string,
  title: string,
  body: string,
  link?: string,
  eventKey?: string,
) {
  const ids = [...new Set(userIds)].filter(Boolean);
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    await db.$transaction(async (tx) => {
      await notifyWithClient(tx, batch, type, title, body, link, eventKey);
    });
  }
}
