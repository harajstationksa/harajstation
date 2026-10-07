import { Agent } from "node:https";
import { lookup } from "node:dns";
import { BlockList, isIP } from "node:net";

export function isAllowedPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      !url.hash &&
      (host === "fcm.googleapis.com" ||
        host === "web.push.apple.com" ||
        host === "updates.push.services.mozilla.com" ||
        host.endsWith(".push.services.mozilla.com") ||
        host.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
const blocked = new BlockList();
for (const [ip, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(ip, bits, "ipv4");
for (const [ip, bits] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  blocked.addSubnet(ip, bits, "ipv6");
export function isPublicPushAddress(address: string) {
  const family = isIP(address);
  return !!family && !blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}
/** Validate the address used by the actual socket, not an earlier DNS result. */
export const safePushAgent = new Agent({
  keepAlive: true,
  maxSockets: 8,
  lookup: (host, options, callback) => {
    lookup(host, { all: true }, (error, addresses) => {
      if (error) return callback(error, [], 0);
      const safe = addresses.filter((a) => isPublicPushAddress(a.address));
      if (!safe.length) return callback(new Error("Push destination rejected"), [], 0);
      if (options.all) callback(null, safe);
      else callback(null, safe[0].address, safe[0].family);
    });
  },
});
