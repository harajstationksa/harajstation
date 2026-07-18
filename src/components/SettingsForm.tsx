"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Camera, CheckCircle2, Loader2, Mail, Trash2 } from "lucide-react";
import { useLang } from "@/components/LangProvider";
import { CITIES } from "@/lib/constants";
import { Avatar } from "./Avatar";
import { AvatarCropper } from "./AvatarCropper";

export function SettingsForm({
  initial,
}: {
  initial: {
    name: string;
    city: string;
    phone: string;
    email: string;
    avatarUrl: string | null;
    avatarColor: string;
  };
}) {
  const { t } = useLang();
  const d = t.dash.settings;
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [emailUnlocked, setEmailUnlocked] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  async function uploadAvatar(file: File) {
    setCropFile(null);
    setAvatarBusy(true);
    setError("");
    const fd = new FormData();
    fd.append("avatar", file);
    const res = await fetch("/api/account/avatar", { method: "POST", body: fd });
    setAvatarBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? d.genericError);
      return;
    }
    setAvatarUrl(data.url);
    router.refresh();
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    await fetch("/api/account/avatar", { method: "DELETE" });
    setAvatarBusy(false);
    setAvatarUrl(null);
    router.refresh();
  }

  const emailChanged = form.email.trim().toLowerCase() !== initial.email.toLowerCase();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSaved(false);
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        city: form.city,
        phone: form.phone,
        email: form.email.trim(),
        ...(emailChanged ? { currentPassword } : {}),
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? d.genericError);
      return;
    }
    setSaved(true);
    setCurrentPassword("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card p-5 space-y-4 max-w-xl">
      {/* avatar */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar
            name={form.name}
            color={form.avatarColor}
            src={avatarUrl}
            className="size-20 text-2xl"
          />
          {avatarBusy && (
            <span className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
              <Loader2 className="size-5 text-white animate-spin" />
            </span>
          )}
        </div>
        <div className="space-y-2">
          <p className="font-semibold text-sm">{d.avatar}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={avatarBusy}
              className="btn-secondary min-h-9 px-4 text-xs"
            >
              <Camera className="size-4" />
              {d.changePhoto}
            </button>
            {avatarUrl && (
              <button
                type="button"
                onClick={removeAvatar}
                disabled={avatarBusy}
                className="btn-ghost min-h-9 px-3 text-xs text-red-600"
              >
                <Trash2 className="size-4" />
                {d.remove}
              </button>
            )}
          </div>
          <p className="text-[11px] text-neutral-400">{d.photoHint}</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setCropFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {cropFile && (
        <AvatarCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onSave={uploadAvatar}
          labels={{
            title: d.cropTitle,
            save: d.cropSave,
            cancel: d.cropCancel,
            hint: d.cropHint,
          }}
        />
      )}

      <div className="border-t border-neutral-100 pt-4">
        <label className="block text-sm font-medium mb-1.5">{d.fullName}</label>
        <input
          className="input"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
          minLength={2}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">{d.email}</label>
        <div className="flex gap-2">
          <input
            className={`input flex-1 ${emailUnlocked ? "" : "bg-neutral-50 text-neutral-500"}`}
            dir="ltr"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            disabled={!emailUnlocked}
            required
          />
          {!emailUnlocked ? (
            <button
              type="button"
              onClick={() => setEmailUnlocked(true)}
              className="btn-secondary shrink-0 px-4 text-xs"
            >
              <Mail className="size-4" />
              {d.changeEmail}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setEmailUnlocked(false);
                setForm((f) => ({ ...f, email: initial.email }));
                setCurrentPassword("");
              }}
              className="btn-ghost shrink-0 px-3 text-xs text-neutral-500"
            >
              {d.cancel}
            </button>
          )}
        </div>
        <p className="text-xs text-neutral-400 mt-1">
          {d.emailNote}
        </p>
      </div>

      {emailUnlocked && emailChanged && (
        <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
          <label className="block text-sm font-medium mb-1.5">
            {d.currentPassword} <span className="text-neutral-400">{d.currentPasswordWhy}</span>
          </label>
          <input
            className="input bg-white"
            dir="ltr"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1.5">{d.city}</label>
        <select
          className="input"
          value={form.city}
          onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
        >
          {CITIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">
          {d.phone} <span className="text-neutral-400">{d.optional}</span>
        </label>
        <input
          className="input"
          dir="ltr"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          placeholder="05XXXXXXXX"
        />
        <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
          {d.phoneNote}
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
          <CheckCircle2 className="size-4" />
          {d.saved}
        </p>
      )}

      <button className="btn-primary" disabled={loading}>
        {loading && <Loader2 className="size-4 animate-spin" />}
        {d.saveBtn}
      </button>
    </form>
  );
}
