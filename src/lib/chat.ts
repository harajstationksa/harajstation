import { db } from "./db";

/**
 * WhatsApp's three states, mapped onto a site that has no persistent socket:
 *
 *   ✓        sent      — the row exists
 *   ✓✓ grey  delivered — the recipient has been on the site since it arrived,
 *                        so their browser could have received it
 *   ✓✓ blue  read      — they opened the conversation
 *
 * "Delivered" is driven from the presence heartbeat (lib/presence), which fires
 * on every page view. That is the closest honest equivalent we have: the phone
 * is in their hand and the app is open, even if the chat itself is not.
 */
export async function markDelivered(userId: string): Promise<void> {
  await db.message.updateMany({
    where: {
      deliveredAt: null,
      senderId: { not: userId },
      conversation: {
        OR: [{ buyerId: userId }, { sellerId: userId }],
      },
    },
    data: { deliveredAt: new Date() },
  });
}
