import { safeNextPath } from "@/lib/authPaths";
import { getServerSupabaseClient, requireUser } from "@/lib/supabaseServer";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function signIn(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? "/"));

  const supabase = await getServerSupabaseClient();

  if (!supabase) {
    redirect("/login?error=supabase_not_configured");
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    redirect(
      `/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`
    );
  }

  revalidatePath("/", "layout");
  revalidatePath(next, "page");

  redirect(next);
}

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next: nextParam } = await searchParams;
  const next = safeNextPath(nextParam);
  const user = await requireUser();

  if (user) {
    redirect(next);
  }

  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const errorMessage =
    error === "supabase_not_configured"
      ? "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
      : error
        ? decodeURIComponent(error)
        : null;

  return (
    <main className="flex min-h-[calc(100vh-3.25rem)] items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          Catalyst CRM
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Sign in</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Use your Supabase Auth email and password to access the dashboard.
        </p>

        {!supabaseConfigured ? (
          <p className="mt-6 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Supabase environment variables are not set. Configure them before
            signing in.
          </p>
        ) : null}

        {errorMessage ? (
          <p className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {errorMessage}
          </p>
        ) : null}

        <form action={signIn} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next} />
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Email</span>
            <input
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-950 outline-none ring-slate-300 focus:ring-2"
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={!supabaseConfigured}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Password</span>
            <input
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-950 outline-none ring-slate-300 focus:ring-2"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={!supabaseConfigured}
            />
          </label>
          <button
            className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            type="submit"
            disabled={!supabaseConfigured}
          >
            Sign in
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link
            className="font-medium text-slate-700 hover:text-slate-950"
            href="/"
            prefetch={false}
          >
            Continue to dashboard
          </Link>
        </p>
      </div>
    </main>
  );
}
