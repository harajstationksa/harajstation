import { deleteUnusedPublicImage } from "./public-image-cleanup";
import { db } from "./db";
import { deleteUnusedAvatar } from "./avatar-cleanup";
import { alertSavedSearches } from "./saved-search";
import { sendPushMany } from "./push";
import { notifyWithClient } from "./notify";

export async function deliverBroadcastBatch(data: {
  event: string;
  cursor: string;
  upper: string;
  title: string;
  body: string;
  link?: string;
}) {
  await db.$transaction(async (tx) => {
    const users = await tx.user.findMany({
      where: { isBanned: false, id: { gt: data.cursor, lte: data.upper } },
      orderBy: { id: "asc" },
      take: 100,
      select: { id: true },
    });
    await notifyWithClient(
      tx,
      users.map((u) => u.id),
      "SYSTEM",
      data.title,
      data.body,
      data.link,
      `broadcast:${data.event}`,
    );
    if (users.length === 100) {
      const cursor = users.at(-1)!.id;
      await tx.backgroundJob.upsert({
        where: { dedupKey: `broadcast:${data.event}:${cursor}` },
        create: {
          dedupKey: `broadcast:${data.event}:${cursor}`,
          kind: "BROADCAST",
          payload: JSON.stringify({ ...data, cursor }),
        },
        update: {},
      });
    }
  });
}

/** Lease jobs using SKIP LOCKED so overlapping cron workers never claim the same row. */
export async function processBackgroundJobs() {
  const stale = new Date(Date.now() - 15 * 60000);
  await db.backgroundJob.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: stale } },
    data: { status: "PENDING", lockedAt: null },
  });
  const started = Date.now();
  for (let count = 0; count < 20 && Date.now() - started < 45000; count++) {
    const jobs = await db.$queryRaw<
      Array<{ id: string; kind: string; payload: string; attempts: number }>
    >`
      UPDATE "BackgroundJob" SET status='RUNNING', "lockedAt"=NOW(), attempts=attempts+1
      WHERE id=(SELECT id FROM "BackgroundJob" WHERE status='PENDING' AND "availableAt"<=NOW() ORDER BY "createdAt",id FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING id,kind,payload,attempts`;
    const job = jobs[0];
    if (!job) break;
    try {
      const data = JSON.parse(job.payload);
      if (job.kind === "LISTING_ALERT") await alertSavedSearches(data.listingId);
      else if (job.kind === "PUSH") await sendPushMany(data.userIds, data.payload);
      else if (job.kind === "PUBLIC_IMAGE_CLEANUP") await deleteUnusedPublicImage(data.url);
      else if (job.kind === "AVATAR_CLEANUP") await deleteUnusedAvatar(data.url);
      else if (job.kind === "BROADCAST") await deliverBroadcastBatch(data);
      else throw new Error("UNKNOWN_JOB");
      await db.backgroundJob.update({
        where: { id: job.id },
        data: { status: "DONE", lockedAt: null },
      });
    } catch {
      console.error("background_job_failed", {
        id: job.id,
        kind: job.kind,
        attempt: job.attempts,
      });
      await db.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: job.attempts >= 5 ? "FAILED" : "PENDING",
          lockedAt: null,
          availableAt: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** job.attempts)),
        },
      });
    }
  }
  await db.backgroundJob.deleteMany({
    where: {
      status: "DONE",
      createdAt: { lt: new Date(Date.now() - 7 * 86400000) },
    },
  });
}
