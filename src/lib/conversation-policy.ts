import { Prisma } from "@prisma/client";
import { db } from "./db";
export function directConversationKey(first: string, second: string) {
  const [a, b] = [first, second].sort();
  return `${a.length}:${a}${b.length}:${b}`;
}
export async function lockChatUsers(tx: Prisma.TransactionClient, ids: string[]) {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM "User" WHERE id IN (${Prisma.join([...new Set(ids)].sort())}) ORDER BY id COLLATE "C" FOR UPDATE`,
  );
}
export async function hasUserBlock(a: string, b: string, client: Prisma.TransactionClient = db) {
  return !!(await client.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { id: true },
  }));
}
