"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { CITIES, CONDITIONS } from "@/lib/constants";

const MAX_IMAGE = 5 * 1024 * 1024;

async function compressImage(file: File): Promise<File | null> {
  if (file.size <= MAX_IMAGE) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.8));
    return blob && blob.size <= MAX_IMAGE
      ? new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" })
      : null;
  } catch {
    return null;
  }
}

export function EditListingForm({
  listing,
}: {
  listing: {
    id: string;
    type: string;
    title: string;
    description: string;
    price: number | null;
    condition: string;
    city: string;
    neighborhood: string | null;
    deliveryMethod: string;
    showPhone: boolean;
    images: string[];
  };
}) {
  const router = useRouter();
  const [existing, setExisting] = useState<string[]>(listing.images);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const kept: File[] = [];
    for (const f of Array.from(list)) {
      const c = await compressImage(f);
      if (c) kept.push(c);
    }
    setFiles((prev) => [...prev, ...kept].slice(0, 10));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    fd.set("keepImages", JSON.stringify(existing));
    fd.delete("images");
    files.forEach((f) => fd.append("images", f));

    const res = await fetch(`/api/listings/${listing.id}`, { method: "PATCH", body: fd });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "تعذّر حفظ التعديلات");
      return;
    }
    router.push(`/dashboard/listings`);
    router.refresh();
  }

  const totalImages = existing.length + files.length;

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="card p-5 space-y-4">
        <h2 className="font-bold">تفاصيل الإعلان</h2>

        <div>
          <label className="block text-sm font-medium mb-1.5">العنوان</label>
          <input name="title" className="input" required maxLength={100} defaultValue={listing.title} />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">الوصف</label>
          <textarea name="description" className="input min-h-32 py-3" required minLength={20} defaultValue={listing.description} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">الحالة</label>
            <select name="condition" className="input" defaultValue={listing.condition}>
              {Object.entries(CONDITIONS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">المدينة</label>
            <select name="city" className="input" defaultValue={listing.city}>
              {CITIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              الحي <span className="text-neutral-400">(اختياري)</span>
            </label>
            <input name="neighborhood" className="input" defaultValue={listing.neighborhood ?? ""} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">طريقة التسليم</label>
            <select name="deliveryMethod" className="input" defaultValue={listing.deliveryMethod}>
              <option value="PICKUP">استلام يدوي (مقابلة)</option>
              <option value="SHIPPING">شحن</option>
              <option value="DELIVERY">توصيل</option>
            </select>
          </div>
        </div>
      </div>

      {listing.type === "STANDARD" && (
        <div className="card p-5 space-y-4">
          <h2 className="font-bold">السعر</h2>
          <input
            name="price"
            className="input"
            required
            inputMode="numeric"
            pattern="\d+"
            defaultValue={listing.price ?? ""}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="showPhone" defaultChecked={listing.showPhone} className="size-4 accent-primary-500" />
            إظهار رقم جوالي في الإعلان
          </label>
        </div>
      )}

      <div className="card p-5 space-y-3">
        <h2 className="font-bold">الصور</h2>
        {totalImages > 0 && (
          <div className="flex gap-2 flex-wrap">
            {existing.map((url) => (
              <div key={url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="size-20 rounded-lg object-cover border border-neutral-200" />
                <button
                  type="button"
                  onClick={() => setExisting((prev) => prev.filter((u) => u !== url))}
                  className="absolute -top-1.5 -left-1.5 size-5 rounded-full bg-neutral-900 text-white flex items-center justify-center cursor-pointer"
                  aria-label="حذف الصورة"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
            {files.map((f, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={URL.createObjectURL(f)} alt="" className="size-20 rounded-lg object-cover border border-neutral-200" />
                <span className="absolute bottom-1 right-1 badge bg-primary-500 text-white text-[10px]">جديد</span>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -left-1.5 size-5 rounded-full bg-neutral-900 text-white flex items-center justify-center cursor-pointer"
                  aria-label="حذف الصورة"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <label className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-200 py-4 cursor-pointer hover:border-primary-400 transition-colors text-sm text-neutral-500">
          <ImagePlus className="size-5" />
          إضافة صور (حتى 10)
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
        </label>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex gap-2">
        <button className="btn-primary" disabled={loading}>
          {loading && <Loader2 className="size-4 animate-spin" />}
          حفظ التعديلات
        </button>
        <button type="button" onClick={() => router.back()} className="btn-secondary">
          إلغاء
        </button>
      </div>
    </form>
  );
}
