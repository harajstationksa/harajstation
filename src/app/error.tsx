"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("application boundary:", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl items-center px-4 text-center">
      <div className="card w-full p-8">
        <h1 className="text-xl font-bold">حدث خطأ غير متوقع</h1>
        <p className="mt-2 text-sm text-neutral-500">
          لم تتغير بياناتك. جرّب إعادة تحميل هذا الجزء، وإذا استمرت المشكلة تواصل مع الدعم.
        </p>
        <button type="button" onClick={reset} className="btn-primary mt-5">
          المحاولة مرة أخرى
        </button>
      </div>
    </main>
  );
}
