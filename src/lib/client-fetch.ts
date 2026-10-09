/** A failed or timed-out request follows the same recoverable path as HTTP errors. */
export async function clientFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const timeout = AbortSignal.timeout(30_000);
  try {
    return await fetch(input, {
      ...init,
      signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
    });
  } catch {
    const english = typeof document !== "undefined" && document.documentElement.lang === "en";
    return Response.json(
      {
        error: english
          ? "Connection failed or timed out. Check your connection and try again."
          : "تعذّر الاتصال أو انتهت المهلة. تحقق من اتصالك وحاول مجددًا.",
      },
      { status: 503 },
    );
  }
}
