"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing, Loader2, MonitorSmartphone, Share } from "lucide-react";
import { useLang } from "@/components/LangProvider";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

/**
 * إشعارات المتصفح (Web Push) — subscribe/unsubscribe this browser, plus an
 * install hint for iOS where push requires adding the site to the home screen.
 */
export function PushManager() {
  const { t } = useLang();
  const d = t.dash.push;
  const [supported, setSupported] = useState<boolean | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isIOS, setIsIOS] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(ios);
    setStandalone(window.matchMedia("(display-mode: standalone)").matches);
    if ("serviceWorker" in navigator && "PushManager" in window) {
      setSupported(true);
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setSubscribed(!!sub))
        .catch(() => {});
    } else {
      setSupported(false);
    }
  }, []);

  async function subscribe() {
    setLoading(true);
    setError("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError(d.denied);
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
        ),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(JSON.parse(JSON.stringify(sub))),
      });
      if (!res.ok) throw new Error();
      setSubscribed(true);
    } catch {
      setError(d.failed);
    } finally {
      setLoading(false);
    }
  }

  async function unsubscribe() {
    setLoading(true);
    setError("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } finally {
      setLoading(false);
    }
  }

  if (supported === null) return null;

  // iOS Safari: push works only after installing to the home screen
  if (!supported) {
    if (isIOS && !standalone) {
      return (
        <div className="card p-4 flex items-start gap-3">
          <span className="size-10 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0">
            <MonitorSmartphone className="size-5" />
          </span>
          <div className="text-sm">
            <p className="font-bold">{d.iosTitle}</p>
            <p className="text-neutral-500 text-xs mt-1 leading-relaxed">
              {d.iosHint1} <Share className="size-3.5 inline" /> {d.iosHint2}
            </p>
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="card p-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={`size-10 rounded-lg border flex items-center justify-center shrink-0 ${
            subscribed
              ? "bg-green-50 border-green-100 text-green-600"
              : "bg-neutral-50 border-neutral-200 text-neutral-500"
          }`}
        >
          {subscribed ? <BellRing className="size-5" /> : <BellOff className="size-5" />}
        </span>
        <div className="min-w-0">
          <p className="font-bold text-sm">{d.title}</p>
          <p className="text-xs text-neutral-500 mt-0.5">
            {subscribed ? d.onHint : d.offHint}
          </p>
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
      </div>
      <button
        type="button"
        onClick={subscribed ? unsubscribe : subscribe}
        disabled={loading}
        className={subscribed ? "btn-secondary" : "btn-primary"}
      >
        {loading && <Loader2 className="size-4 animate-spin" />}
        {subscribed ? d.stop : d.enable}
      </button>
    </div>
  );
}
