"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const detail = error.message || error.digest || null;

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <main className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-950">
            Something went wrong
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            The error was reported to monitoring. Try again or contact support if
            the problem continues.
          </p>
          {detail ? (
            <p className="mt-3 break-words rounded-xl bg-slate-100 px-3 py-2 text-left font-mono text-xs text-slate-700">
              {detail}
            </p>
          ) : null}
          <button
            className="mt-6 rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white"
            onClick={() => reset()}
            type="button"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
