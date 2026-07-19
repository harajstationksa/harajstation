"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  ImagePlus,
  Loader2,
  Lock,
  Send,
  ShieldAlert,
  X,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { compressImage } from "@/lib/image-compress";
import {
  isChatMuted,
  playIncomingChime,
  setChatMuted,
  unlockChatSound,
} from "@/lib/chat-sound";
import { ReportButton } from "./ReportButton";
import { useLang } from "./LangProvider";

type Msg = {
  id: string;
  body: string;
  imageUrl?: string | null;
  mine: boolean;
  at: string;
  deliveredAt?: string | null;
  readAt?: string | null;
};

/** ✓ sent · ✓✓ delivered · ✓✓ (accent) read — only ever on your own messages. */
function Ticks({ msg, labels }: { msg: Msg; labels: { read: string; delivered: string; sent: string } }) {
  if (msg.readAt) {
    return <CheckCheck className="size-3.5 text-sky-300" aria-label={labels.read} />;
  }
  if (msg.deliveredAt) {
    return <CheckCheck className="size-3.5 opacity-80" aria-label={labels.delivered} />;
  }
  return <Check className="size-3.5 opacity-70" aria-label={labels.sent} />;
}

export function ChatThread({
  conversationId,
  role = "buyer",
}: {
  conversationId: string;
  role?: "buyer" | "seller";
}) {
  const { t } = useLang();
  const d = t.dash.chat;
  const quickReplies = role === "seller" ? d.quickSeller : d.quickBuyer;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [muted, setMuted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const countRef = useRef(0);
  // how many of THEIR messages we had last poll — the chime keys off this, not
  // off the total, so your own sends never ring
  const theirCountRef = useRef<number | null>(null);

  useEffect(() => setMuted(isChatMuted()), []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      const list: Msg[] = data.messages;

      const theirs = list.filter((m) => !m.mine).length;
      // null on the very first load: opening a thread with unread messages
      // shouldn't sound like they all just arrived
      if (theirCountRef.current !== null && theirs > theirCountRef.current) {
        playIncomingChime();
      }
      theirCountRef.current = theirs;

      setMessages(list);
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
      setError(d.imageFail);
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
      setError(data.error ?? d.sendFail);
      return;
    }
    setText("");
    setImage(null);
    if (fileRef.current) fileRef.current.value = "";
    refresh();
  }

  return (
    // any interaction in here counts as the gesture that lets audio play, so the
    // first message to arrive after you've typed or clicked actually chimes
    <div
      className="card flex flex-col h-[60vh] min-h-96"
      onPointerDown={unlockChatSound}
      onKeyDown={unlockChatSound}
    >
      {/* encryption notice + sound toggle */}
      <div className="px-3 py-1.5 border-b border-neutral-100 flex items-center gap-1.5 text-[11px] text-neutral-400">
        <span className="flex-1 flex items-center justify-center gap-1.5">
          <Lock className="size-3" />
          {d.encrypted}
        </span>
        <button
          type="button"
          onClick={() => {
            const next = !muted;
            setChatMuted(next);
            setMuted(next);
            if (!next) unlockChatSound(); // this click is the gesture that allows it
          }}
          className="shrink-0 size-6 rounded-full hover:bg-neutral-100 flex items-center justify-center transition-colors"
          title={muted ? d.unmute : d.mute}
          aria-label={muted ? d.unmute : d.mute}
        >
          {muted ? <BellOff className="size-3.5" /> : <Bell className="size-3.5" />}
        </button>
      </div>

      <div className="px-4 py-2.5 border-b border-neutral-100 bg-amber-50/60 flex items-start gap-2 text-xs text-amber-800 leading-relaxed">
        <ShieldAlert className="size-4 shrink-0 mt-0.5" />
        {d.safety}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-sm text-neutral-400 py-8">
            {d.start}
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
                    alt={d.attachedAlt}
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
                  "flex items-center gap-1.5 mt-1 text-[10px]",
                  m.imageUrl && "px-2 pb-1",
                  m.mine ? "text-primary-100" : "text-neutral-400"
                )}
              >
                <span suppressHydrationWarning>{timeAgo(m.at)}</span>
                {m.mine && <Ticks msg={m} labels={d} />}
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
            aria-label={d.removeImage}
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* quick replies: one tap fills the box — sellers answer in seconds,
          buyers break the ice without composing anything */}
      {!text && (
        <div className="px-3 pb-1.5 flex gap-1.5 overflow-x-auto no-scrollbar">
          {quickReplies.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setText(q)}
              className="shrink-0 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-600 hover:border-primary-300 hover:text-primary-700 transition-colors cursor-pointer"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={send} className="p-3 border-t border-neutral-100 flex gap-2">
        <label
          className="btn-secondary px-3 shrink-0 cursor-pointer"
          title={d.attachImage}
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
          placeholder={d.typePh}
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
          aria-label={d.closeImage}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-h-[90vh] max-w-full rounded-xl object-contain" />
        </button>
      )}
    </div>
  );
}
