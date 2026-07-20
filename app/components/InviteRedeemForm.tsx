"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { redeemMembershipInvite } from "@/lib/actions/invites";

export default function InviteRedeemForm({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await redeemMembershipInvite({ token, email, password });
      if (result.ok) {
        setMessage(result.message);
        setDone(true);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-[var(--app-panel)] p-6 shadow-lg">
      <h1 className="text-2xl font-semibold text-white">Join Catalyst CRM</h1>
      <p className="mt-2 text-sm text-slate-400">
        Create your account with this invite. You&apos;ll get sales access to the
        shared organization.
      </p>

      {done ? (
        <div className="mt-6 space-y-4">
          <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {message}
          </p>
          <Link
            className="inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
            href="/login"
            prefetch={false}
          >
            Go to sign in
          </Link>
        </div>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block text-xs text-slate-400">
            Work email
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
              disabled={pending}
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label className="block text-xs text-slate-400">
            Password (min 8 characters)
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
              disabled={pending}
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {error ? (
            <p
              className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <button
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            disabled={pending}
            type="submit"
          >
            {pending ? "Creating account…" : "Create account & join"}
          </button>
        </form>
      )}
    </div>
  );
}
