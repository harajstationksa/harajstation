"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  Camera,
  ExternalLink,
  ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Store,
  Trash2,
  X,
} from "lucide-react";

type StoreT = {
  id: string;
  name: string;
  slug: string;
  description: string;
  logoUrl?: string | null;
  bannerUrl?: string | null;
};

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
      setError(data.error ?? "تعذّر رفع الصورة");
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
              <span className="text-[10px]">اختر صورة</span>
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
              {current ? "تغيير" : "رفع صورة"}
            </button>
            {current && (
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="act-btn bg-red-50 text-red-600 hover:bg-red-100"
              >
                <Trash2 className="size-3.5" />
                إزالة
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

function StoreEditor({
  store,
  onClose,
}: {
  store: StoreT | null; // null = create
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState(
    store ?? { id: "", name: "", slug: "", description: "" }
  );
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
        name: form.name,
        slug: form.slug,
        description: form.description,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "تعذّر الحفظ");
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-bold">{store ? "تعديل المتجر" : "متجر جديد"}</p>
        <button type="button" onClick={onClose} className="text-neutral-400 cursor-pointer">
          <X className="size-4" />
        </button>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1.5">اسم المتجر</label>
        <input
          className="input"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="مثال: متجر العمري للتقنية"
          required
          minLength={3}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1.5">معرف المتجر (الرابط)</label>
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
        <p className="text-xs text-neutral-400 mt-1">أحرف إنجليزية صغيرة وأرقام وشرطات (3–30)</p>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1.5">وصف المتجر</label>
        <textarea
          className="input min-h-20 py-3"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="ماذا تبيع؟ ما الذي يميز متجرك؟"
          maxLength={500}
        />
      </div>

      {store ? (
        <div className="grid sm:grid-cols-2 gap-4 border-t border-neutral-100 pt-4">
          <StoreImageField
            storeId={store.id}
            kind="logo"
            label="شعار المتجر"
            hint="مربعة، تظهر بجانب اسم المتجر"
            current={store.logoUrl}
          />
          <StoreImageField
            storeId={store.id}
            kind="banner"
            label="بانر المتجر"
            hint="عريضة (يفضل 1200×300)، تظهر أعلى صفحة المتجر"
            current={store.bannerUrl}
            wide
          />
        </div>
      ) : (
        <p className="text-xs text-neutral-400 border-t border-neutral-100 pt-3">
          بعد إنشاء المتجر يمكنك إضافة الشعار والبانر من زر «تعديل».
        </p>
      )}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      )}
      <button className="btn-primary" disabled={loading}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Store className="size-4" />}
        {store ? "حفظ التغييرات" : "إنشاء المتجر"}
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
  const [editing, setEditing] = useState<string | null>(null); // store id
  const [creating, setCreating] = useState(false);

  async function remove(id: string) {
    if (!window.confirm("حذف المتجر نهائياً؟")) return;
    await fetch(`/api/store?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  const canAdd = stores.length < maxStores;

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-500">
        لديك {stores.length} من أصل {maxStores} متجر متاح لخطتك
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
                <p className="font-semibold text-sm line-clamp-1">{s.name}</p>
                <p className="text-xs text-neutral-400" dir="ltr">/store/{s.slug}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Link href={`/store/${s.slug}`} className="badge bg-neutral-100 text-neutral-700 hover:bg-neutral-200">
                <ExternalLink className="size-3.5" />
                عرض
              </Link>
              <button onClick={() => setEditing(s.id)} className="badge bg-neutral-100 text-neutral-700 hover:bg-neutral-200 cursor-pointer">
                <Pencil className="size-3.5" />
                تعديل
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
          إنشاء متجر جديد
        </button>
      ) : (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex items-center justify-between gap-2">
          <span>وصلت للحد الأقصى من المتاجر لخطتك.</span>
          <Link href="/pro" className="font-semibold hover:underline shrink-0">رقِّ للبرو</Link>
        </div>
      )}
    </div>
  );
}
