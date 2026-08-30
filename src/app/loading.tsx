export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-7xl animate-pulse space-y-5 px-4 py-8" aria-busy="true">
      <div className="h-8 w-48 rounded-lg bg-neutral-200" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="card h-64 bg-neutral-100" />
        ))}
      </div>
      <span className="sr-only">جارٍ التحميل</span>
    </main>
  );
}
