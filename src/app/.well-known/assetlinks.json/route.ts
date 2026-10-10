import { NextResponse } from "next/server";

/**
 * Android App Links: lets the installed app open harajstation.com links
 * directly. ANDROID_CERT_SHA256 holds the Play App Signing certificate
 * fingerprint(s) (Play Console → App integrity), comma-separated.
 */
export function GET() {
  const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? "")
    .split(",")
    .map((v) => v.trim().toUpperCase())
    .filter((v) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(v));
  const body = fingerprints.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: process.env.ANDROID_PACKAGE_NAME ?? "com.harajstation.haraj_station",
            sha256_cert_fingerprints: fingerprints,
          },
        },
      ]
    : [];
  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
