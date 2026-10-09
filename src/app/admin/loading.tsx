export default function Loading() {
  return (
    <div role="status" aria-label="جارٍ تحميل صفحة الإدارة" className="space-y-6">
      <span className="sr-only">جارٍ تحميل صفحة الإدارة…</span>
      <div className="flex items-center gap-4 animate-pulse" aria-hidden="true">
        <div className="size-13 shrink-0 rounded-2xl bg-neutral-200" />
        <div className="space-y-3 min-w-0 flex-1">
          <div className="h-6 w-48 max-w-full rounded bg-neutral-200" />
          <div className="h-3 w-64 max-w-full rounded bg-neutral-200" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:gap-4 animate-pulse" aria-hidden="true">
        {[0, 1, 2].map((key) => (
          <div key={key} className="card p-3 sm:p-6 h-28 sm:h-32">
            <div className="h-3 w-24 max-w-full bg-neutral-100 rounded" />
            <div className="h-8 w-16 max-w-full bg-neutral-100 rounded mt-5" />
          </div>
        ))}
      </div>
      <div className="card p-6 space-y-6 animate-pulse" aria-hidden="true">
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className="h-12 rounded-xl bg-neutral-50" />
        ))}
      </div>
    </div>
  );
}
