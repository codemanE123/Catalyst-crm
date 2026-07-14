export default function AgentsLoading() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-950 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-8" aria-busy="true" aria-live="polite">
        <div>
          <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
          <div className="mt-4 h-8 w-64 animate-pulse rounded bg-slate-200" />
          <div className="mt-3 h-4 w-full max-w-2xl animate-pulse rounded bg-slate-200" />
        </div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, index) => (
            <div
              key={index}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
              <div className="mt-3 h-8 w-16 animate-pulse rounded bg-slate-200" />
            </div>
          ))}
        </section>

        <div className="h-40 animate-pulse rounded-3xl border border-slate-200 bg-white" />
        <div className="h-72 animate-pulse rounded-3xl border border-slate-200 bg-white" />
        <p className="text-sm text-slate-500">Loading agent operations…</p>
      </div>
    </main>
  );
}
