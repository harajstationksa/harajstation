"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  Camera,
  ExternalLink,
  ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Share2,
  Store,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { StoreVerifyCard } from "@/components/StoreVerifyCard";
import { useLang } from "@/components/LangProvider";

type StoreT = {
  id: string;
  name: string;
  slug: string;
  description: string;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  isVerified: boolean;
  verifyStatus: "PENDING" | "APPROVED" | "REJECTED" | null;
  verifyNote: string | null;
  followers: number;
  website: string | null;
  twitter: string | null;
  instagram: string | null;
  tiktok: string | null;
  snapchat: string | null;
  youtube: string | null;
  whatsapp: string | null;
};

/** platform key → placeholder kind ("handle" | "channel" | literal) */
const SOCIAL_FIELDS: { key: SocialKey; ph: "handle" | "channel" | string }[] = [
  { key: "twitter", ph: "handle" },
  { key: "instagram", ph: "handle" },
  { key: "tiktok", ph: "handle" },
  { key: "snapchat", ph: "handle" },
  { key: "youtube", ph: "channel" },
  { key: "whatsapp", ph: "9665xxxxxxxx" },
  { key: "website", ph: "https://example.com" },
];
type SocialKey =
  | "website"
  | "twitter"
  | "instagram"
  | "tiktok"
  | "snapchat"
  | "youtube"
  | "whatsapp";

/** Upload/replace/remove one store image (logo or banner) — saves instantly. */
function StoreImageField({
  storeId,
  kind,
  label,
  hint,
  current,
  wide,
}: {
  storeId: string;
  kind: "logo" | "banner";
  label: string;
  hint: string;
  current: string | null | undefined;
  wide?: boolean;
}) {
  const router = useRouter();
  const { t } = useLang();
  const ds = t.dash.stores;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setBusy(true);
    setError("");
    const fd = new FormData();
    fd.set("storeId", storeId);
    fd.set("kind", kind);
    fd.set("image", file);
    const res = await fetch("/api/store/images", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? ds.uploadFail);
      return;
    }
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    await fetch(`/api/store/images?id=${storeId}&kind=${kind}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className={`relative overflow-hidden rounded-xl border-2 border-dashed border-neutral-200 hover:border-primary-400 transition-colors cursor-pointer bg-neutral-50 flex items-center justify-center shrink-0 ${
            wide ? "h-20 w-52" : "size-20"
          }`}
        >
          {current ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-1 text-neutral-400">
              <ImageIcon className="size-5" />
              <span className="text-[10px]">{ds.pickImage}</span>
            </span>
          )}
          {busy && (
            <span className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 className="size-5 text-white animate-spin" />
            </span>
          )}
        </button>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="act-btn bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            >
              <Camera className="size-3.5" />
              {current ? ds.change : ds.upload}
            </button>
            {current && (
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="act-btn bg-red-50 text-red-600 hover:bg-red-100"
              >
                <Trash2 className="size-3.5" />
                {ds.remove}
              </button>
            )}
          </div>
          <p className="text-[11px] text-neutral-400">{hint}</p>
          {error && <p className="text-[11px] text-red-600">{error}</p>}
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** Pick a logo/banner while the store is still being created — uploaded right after creation. */
function PendingImageField({
  label,
  hint,
  file,
  onPick,
  wide,
}: {
  label: string;
  hint: string;
  file: File | null;
  onPick: (f: File | null) => void;
  wide?: boolean;
}) {
  const { t } = useLang();
  const ds = t.dash.stores;
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={`relative overflow-hidden rounded-xl border-2 border-dashed border-neutral-200 hover:border-primary-400 transition-colors cursor-pointer bg-neutral-50 flex items-center justify-center shrink-0 ${
            wide ? "h-20 w-52" : "size-20"
          }`}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-1 text-neutral-400">
              <ImageIcon className="size-5" />
              <span className="text-[10px]">{ds.pickImage}</span>
            </span>
          )}
        </button>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="act-btn bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            >
              <Camera className="size-3.5" />
              {file ? ds.change : ds.upload}
            </button>
            {file && (
              <button
                type="button"
                onClick={() => onPick(null)}
                className="act-btn bg-red-50 text-red-600 hover:bg-red-100"
              >
                <Trash2 className="size-3.5" />
                {ds.remove}
              </button>
            )}
          </div>
          <p className="text-[11px] text-neutral-400">{hint}</p>
          {error && <p className="text-[11px] text-red-600">{error}</p>}
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            if (f.size > 5 * 1024 * 1024) {
              setError(ds.tooBig);
            } else {
              setError("");
              onPick(f);
            }
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}

function StoreEditor({
  store,
  onClose,
}: {
  store: StoreT | null; // null = create
  onClose: () => void;
}) {
  const router = useRouter();
  const { t } = useLang();
  const ds = t.dash.stores;
  const [form, setForm] = useState({
    name: store?.name ?? "",
    slug: store?.slug ?? "",
    description: store?.description ?? "",
    website: store?.website ?? "",
    twitter: store?.twitter ?? "",
    instagram: store?.instagram ?? "",
    tiktok: store?.tiktok ?? "",
    snapchat: store?.snapchat ?? "",
    youtube: store?.youtube ?? "",
    whatsapp: store?.whatsapp ?? "",
  });
  // images picked while creating — uploaded right after the store exists
  const [picked, setPicked] = useState<{ logo: File | null; banner: File | null }>({
    logo: null,
    banner: null,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId: store?.id,
        ...form,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLoading(false);
      setError(data.error ?? ds.saveFail);
      return;
    }
    if (!store && data.id) {
      for (const kind of ["logo", "banner"] as const) {
        const file = picked[kind];
        if (!file) continue;
        const fd = new FormData();
        fd.set("storeId", data.id);
        fd.set("kind", kind);
        fd.set("image", file);
        await fetch("/api/store/images", { method: "POST", body: fd });
      }
    }
    setLoading(false);
    onClose();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-bold">{store ? ds.editTitle : ds.newTitle}</p>
        <button type="button" onClick={onClose} className="text-neutral-400 cursor-pointer">
          <X className="size-4" />
        </button>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1.5">{ds.name}</label>
        <input
          className="input"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder={ds.namePh}
          required
          minLength={3}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1.5">{ds.slug}</label>
        <div className="flex items-center gap-2" dir="ltr">
          <span className="text-sm text-neutral-400">
            {(process.env.NEXT_PUBLIC_SITE_URL ?? "https://harajstation.com").replace(/^https?:\/\//, "")}/store/
          </span>
          <input
            className="input flex-1"
            value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() }))}
            placeholder="my-store"
            pattern="[a-z0-9-]{3,30}"
            required
          />
        </div>
        <p className="text-xs text-neutral-400 mt-1">{ds.slugHint}</p>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1.5">{ds.desc}</label>
        <textarea
          className="input min-h-20 py-3"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder={ds.descPh}
          maxLength={500}
        />
      </div>

      {/* social profiles — give the store a professional identity */}
      <div className="border-t border-neutral-100 pt-4">
        <p className="text-sm font-bold mb-1 flex items-center gap-1.5">
          <Share2 className="size-4 text-primary-500" />
          {ds.socialTitle}
        </p>
        <p className="text-xs text-neutral-400 mb-3">
          {ds.socialHint}
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {SOCIAL_FIELDS.map(({ key, ph }) => (
            <div key={key}>
              <label className="block text-xs font-medium mb-1 text-neutral-600">{ds.socials[key]}</label>
              <input
                className="input !text-sm"
                dir="ltr"
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={ph === "handle" ? ds.socials.handlePh : ph === "channel" ? ds.socials.channelPh : ph}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 border-t border-neutral-100 pt-4">
        {store ? (
          <>
            <StoreImageField
              storeId={store.id}
              kind="logo"
              label={ds.logoLabel}
              hint={ds.logoHint}
              current={store.logoUrl}
            />
            <StoreImageField
              storeId={store.id}
              kind="banner"
              label={ds.bannerLabel}
              hint={ds.bannerHint}
              current={store.bannerUrl}
              wide
            />
          </>
        ) : (
          <>
            <PendingImageField
              label={ds.logoLabel}
              hint={ds.logoHint}
              file={picked.logo}
              onPick={(f) => setPicked((p) => ({ ...p, logo: f }))}
            />
            <PendingImageField
              label={ds.bannerLabel}
              hint={ds.bannerHint}
              file={picked.banner}
              onPick={(f) => setPicked((p) => ({ ...p, banner: f }))}
              wide
            />
          </>
        )}
      </div>

      {store && (
        <StoreVerifyCard
          storeId={store.id}
          verified={store.isVerified}
          status={store.verifyStatus}
          note={store.verifyNote}
        />
      )}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      )}
      <button className="btn-primary" disabled={loading}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Store className="size-4" />}
        {store ? ds.save : ds.create}
      </button>
    </form>
  );
}

export function StoresManager({
  stores,
  maxStores,
}: {
  stores: StoreT[];
  maxStores: number;
}) {
  const router = useRouter();
  const { t } = useLang();
  const ds = t.dash.stores;
  const [editing, setEditing] = useState<string | null>(null); // store id
  const [creating, setCreating] = useState(false);

  async function remove(id: string) {
    if (!window.confirm(ds.delConfirm)) return;
    await fetch(`/api/store?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  const canAdd = stores.length < maxStores;

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-500">
        {ds.quota(stores.length, maxStores)}
      </p>

      {stores.map((s) =>
        editing === s.id ? (
          <StoreEditor key={s.id} store={s} onClose={() => setEditing(null)} />
        ) : (
          <div key={s.id} className="card p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {s.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.logoUrl}
                  alt=""
                  className="size-11 rounded-xl object-cover border border-neutral-100 shrink-0"
                />
              ) : (
                <span className="size-11 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center shrink-0">
                  <Store className="size-5" />
                </span>
              )}
              <div className="min-w-0">
                <p className="font-semibold text-sm line-clamp-1 flex items-center gap-1.5">
                  {s.name}
                  {s.isVerified && (
                    <BadgeCheck className="size-4 text-green-600 shrink-0" aria-label={ds.verifiedBadge} />
                  )}
                </p>
                <p className="text-xs text-neutral-400 flex items-center gap-2">
                  <span dir="ltr">/store/{s.slug}</span>
                  <span className="flex items-center gap-0.5">
                    <Users className="size-3" />
                    {s.followers.toLocaleString("en-US")} {ds.followers}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Link href={`/store/${s.slug}`} className="badge bg-neutral-100 text-neutral-700 hover:bg-neutral-200">
                <ExternalLink className="size-3.5" />
                {ds.view}
              </Link>
              <button onClick={() => setEditing(s.id)} className="badge bg-neutral-100 text-neutral-700 hover:bg-neutral-200 cursor-pointer">
                <Pencil className="size-3.5" />
                {ds.edit}
              </button>
              <button onClick={() => remove(s.id)} className="badge bg-red-50 text-red-600 hover:bg-red-100 cursor-pointer">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
        )
      )}

      {creating ? (
        <StoreEditor store={null} onClose={() => setCreating(false)} />
      ) : canAdd ? (
        <button
          onClick={() => setCreating(true)}
          className="w-full card p-4 flex items-center justify-center gap-2 text-sm font-semibold text-primary-600 border-dashed hover:bg-primary-50/40 transition-colors cursor-pointer"
        >
          <Plus className="size-4" />
          {ds.createNew}
        </button>
      ) : (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex items-center justify-between gap-2">
          <span>{ds.maxReached}</span>
          <Link href="/pro" className="font-semibold hover:underline shrink-0">{ds.goPro}</Link>
        </div>
      )}
    </div>
  );
}
