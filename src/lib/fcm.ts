import { SignJWT, importPKCS8 } from "jose";
import { db } from "./db";

/**
 * Native app push through Firebase Cloud Messaging (HTTP v1). Configured by
 * one env var holding the Firebase service-account JSON (raw or base64):
 *   FCM_SERVICE_ACCOUNT='{"project_id":"…","client_email":"…","private_key":"…"}'
 * Unset → every call is a no-op, exactly like Web Push without VAPID keys.
 */

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

let cachedAccount: ServiceAccount | null | undefined;
function serviceAccount(): ServiceAccount | null {
  if (cachedAccount !== undefined) return cachedAccount;
  const raw = process.env.FCM_SERVICE_ACCOUNT?.trim();
  cachedAccount = null;
  if (!raw) return null;
  try {
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(json) as Partial<ServiceAccount>;
    if (parsed.project_id && parsed.client_email && parsed.private_key)
      cachedAccount = parsed as ServiceAccount;
  } catch {
    cachedAccount = null;
  }
  return cachedAccount;
}

export function fcmConfigured() {
  return serviceAccount() !== null;
}

let accessToken: { value: string; expiresAt: number } | null = null;
async function getAccessToken(account: ServiceAccount): Promise<string> {
  if (accessToken && accessToken.expiresAt > Date.now() + 60_000) return accessToken.value;
  const key = await importPKCS8(account.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.client_email)
    .setSubject(account.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("FCM_AUTH_FAILED");
  const body = (await res.json()) as { access_token: string; expires_in: number };
  accessToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return accessToken.value;
}

export type FcmPayload = { title: string; body: string; link?: string };

/** FCM error codes that mean the token will never work again. */
const DEAD_TOKEN = new Set(["UNREGISTERED", "INVALID_ARGUMENT", "SENDER_ID_MISMATCH"]);

/**
 * Deliver to every registered device of these users. Dead tokens are deleted;
 * transient provider errors are swallowed so a retried job never double-sends
 * to the devices that already got the message.
 */
export async function sendFcmMany(userIds: string[], payload: FcmPayload): Promise<void> {
  const account = serviceAccount();
  if (!account) return;
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return;
  const devices = await db.deviceToken.findMany({
    where: { userId: { in: ids } },
    select: { id: true, token: true },
  });
  if (!devices.length) return;

  const bearer = await getAccessToken(account);
  const url = `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`;
  const link = payload.link ?? "/dashboard/notifications";

  for (let offset = 0; offset < devices.length; offset += 8) {
    await Promise.allSettled(
      devices.slice(offset, offset + 8).map(async (device) => {
        const res = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify({
            message: {
              token: device.token,
              notification: { title: payload.title, body: payload.body },
              data: { link },
              android: {
                priority: "high",
                notification: { channel_id: "haraj_default", sound: "default" },
              },
              apns: { payload: { aps: { sound: "default" } } },
            },
          }),
        });
        if (res.ok) return;
        const error = (await res.json().catch(() => null)) as {
          error?: { status?: string; details?: { errorCode?: string }[] };
        } | null;
        const codes = [
          error?.error?.status,
          ...(error?.error?.details ?? []).map((d) => d.errorCode),
        ].filter(Boolean) as string[];
        if (res.status === 404 || codes.some((c) => DEAD_TOKEN.has(c)))
          await db.deviceToken.delete({ where: { id: device.id } }).catch(() => {});
      }),
    );
  }
}
