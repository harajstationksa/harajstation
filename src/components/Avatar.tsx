import { cn } from "@/lib/utils";

/**
 * User avatar. `pro` draws the PRO membership mark: a small animated orange
 * flame perched on the avatar's top corner (subtle flicker + glow).
 */
export function Avatar({
  name,
  color,
  src,
  className,
  pro = false,
}: {
  name: string;
  color: string;
  src?: string | null;
  className?: string;
  pro?: boolean;
}) {
  const core = src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      className={cn(
        "rounded-full object-cover shrink-0 border border-neutral-200",
        className ?? "size-9"
      )}
    />
  ) : (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full text-white font-bold select-none shrink-0",
        className ?? "size-9 text-sm"
      )}
      style={{ backgroundColor: color }}
    >
      {name.trim().charAt(0)}
    </span>
  );

  if (!pro) return core;
  return (
    <span title="حساب برو" className="relative inline-flex shrink-0">
      {core}
      {/* golden PRO flame — sized relative to the avatar so it scales everywhere */}
      <span
        aria-hidden
        className="absolute -top-[10%] -end-[5%] w-[32%] aspect-square pointer-events-none animate-pro-flame origin-bottom"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pro-flame.png" alt="" className="size-full object-contain" />
      </span>
    </span>
  );
}
