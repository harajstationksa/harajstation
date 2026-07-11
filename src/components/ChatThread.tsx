"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Lock, Send, ShieldAlert, X } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { ReportButton } from "./ReportButton";

type Msg = {
  id: string;
  body: string;
  imageUrl?: string | null;
  mine: boolean;
  at: string;
};

const MAX_IMAGE = 5 * 1024 * 1024; // 5MB

/** Compress oversized images client-side (canvas → JPEG) before upload. */
async function compressImage(file: File): Promise<File | null> {
  if (file.size <= MAX_IMAGE) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.8)
    );
    if (!blob || blob.size > MAX_IMAGE) return null;
    return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
  } catch {
    return null;
  }
}

export function ChatThread({ conversationId }: { conversationId: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const countRef = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages);
    } catch {
      /* offline */
    }
  }, [conversationId]);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const id = setInterval(refresh, 3000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [refresh]);

  useEffect(() => {
    if (messages.length !== countRef.current) {
      countRef.current = messages.length;
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  async function pickImage(list: FileList | null) {
    setError("");
    const file = list?.[0];
    if (!file) return;
    const compressed = await compressImage(file);
    if (!compressed) {
      setError("تعذّر معالجة الصورة — جرّب صورة أصغر");
      return;
    }
    setImage(compressed);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body && !image) return;
    setSending(true);
    setError("");

    let res: Response;
    if (image) {
      const fd = new FormData();
      fd.set("body", body);
      fd.set("image", image);
      res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        body: fd,
      });
    } else {
      res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
    }
    setSending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "تعذّر الإرسال");
      return;
    }
    setText("");
    setImage(null);
    if (fileRef.current) fileRef.current.value = "";
    refresh();
  }

  return (
    <div className="card flex flex-col h-[60vh] min-h-96">
      {/* encryption notice */}
      <div className="px-4 py-1.5 border-b border-neutral-100 flex items-center justify-center gap-1.5 text-[11px] text-neutral-400">
        <Lock className="size-3" />
        الرسائل مشفّرة — لا يطّلع عليها أحد غيرك أنت والطرف الآخر
      </div>

      <div className="px-4 py-2.5 border-b border-neutral-100 bg-amber-50/60 flex items-start gap-2 text-xs text-amber-800 leading-relaxed">
        <ShieldAlert className="size-4 shrink-0 mt-0.5" />
        لأمانك: لا تشارك بياناتك البنكية أو أي أكواد تحقق، وقابل الطرف الآخر في
        مكان عام، وألغِ الصفقة فوراً عند أي طلب مريب.
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-sm text-neutral-400 py-8">
            ابدأ المحادثة — اسأل عن التفاصيل قبل الشراء
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.mine ? "justify-start flex-row-reverse" : "")}>
            <div
              className={cn(
                "max-w-[75%] rounded-2xl text-sm leading-relaxed group overflow-hidden",
                m.imageUrl ? "p-1.5" : "px-3.5 py-2",
                m.mine
                  ? "bg-primary-500 text-white rounded-bl-sm"
                  : "bg-neutral-100 text-neutral-800 rounded-br-sm"
              )}
            >
              {m.imageUrl && (
                <button
                  type="button"
                  onClick={() => setLightbox(m.imageUrl!)}
                  className="block cursor-zoom-in"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.imageUrl}
                    alt="صورة مرفقة"
                    loading="lazy"
                    className="rounded-xl max-h-64 w-full object-cover"
                  />
                </button>
              )}
              {m.body && (
                <p className={cn("whitespace-pre-line break-words", m.imageUrl && "px-2 pt-1.5")}>
                  {m.body}
                </p>
              )}
              <div
                className={cn(
                  "flex items-center gap-2 mt-1 text-[10px]",
                  m.imageUrl && "px-2 pb-1",
                  m.mine ? "text-primary-100" : "text-neutral-400"
                )}
              >
                <span suppressHydrationWarning>{timeAgo(m.at)}</span>
                {!m.mine && <ReportButton targetType="MESSAGE" targetId={m.id} compact />}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="mx-4 mb-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
          {error}
        </p>
      )}

      {/* pending image preview */}
      {image && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-2 w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={URL.createObjectURL(image)}
            alt=""
            className="size-14 rounded-lg object-cover"
          />
          <button
            type="button"
            onClick={() => {
              setImage(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
            className="size-6 rounded-full bg-neutral-900 text-white flex items-center justify-center cursor-pointer"
            aria-label="إزالة الصورة"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <form onSubmit={send} className="p-3 border-t border-neutral-100 flex gap-2">
        <label
          className="btn-secondary px-3 shrink-0 cursor-pointer"
          title="إرفاق صورة"
        >
          <ImagePlus className="size-4" />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => pickImage(e.target.files)}
          />
        </label>
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="اكتب رسالتك..."
          maxLength={2000}
        />
        <button
          className="btn-primary px-4 shrink-0"
          disabled={sending || (!text.trim() && !image)}
        >
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4 -scale-x-100" />}
        </button>
      </form>

      {/* image lightbox */}
      {lightbox && (
        <button
          type="button"
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
          aria-label="إغلاق الصورة"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-h-[90vh] max-w-full rounded-xl object-contain" />
        </button>
      )}
    </div>
  );
}
