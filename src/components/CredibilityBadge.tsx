import { Star } from "lucide-react";
import { trustLevel } from "@/lib/utils";

export function CredibilityBadge({
  score,
  compact = false,
}: {
  score: number;
  compact?: boolean;
}) {
  const level = trustLevel(score);
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: level.color }}>
        <Star className="size-3.5 fill-current" />
        {score}
      </span>
    );
  }
  return (
    <span
      className="badge border"
      style={{
        color: level.color,
        borderColor: `${level.color}44`,
        backgroundColor: `${level.color}11`,
      }}
    >
      <Star className="size-3.5 fill-current" />
      {level.label} · {score}/100
    </span>
  );
}
