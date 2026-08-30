"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="bg-neutral-50">
        <main className="mx-auto flex min-h-screen max-w-xl items-center px-4 text-center">
          <div className="w-full rounded-2xl bg-white p-8 shadow-sm">
            <h1 className="text-xl font-bold">تعذّر تحميل حراج ستيشن</h1>
            <p className="mt-2 text-sm text-neutral-500">المشكلة مؤقتة غالبًا. حاول مرة أخرى.</p>
            <button type="button" onClick={reset} className="mt-5 rounded-xl bg-black px-5 py-3 text-white">
              إعادة المحاولة
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
