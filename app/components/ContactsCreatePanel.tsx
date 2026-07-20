"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createContact } from "@/lib/actions/contacts";
import { createPartner, type PartnerRecord } from "@/lib/actions/partners";

type SchoolOption = { id: string; name: string };

export default function ContactsCreatePanel({
  schools,
  partners,
  canAct
}: {
  schools: SchoolOption[];
  partners: PartnerRecord[];
  canAct: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [affiliation, setAffiliation] = useState<"school" | "partner">("partner");

  if (!canAct) {
    return null;
  }

  function run(
    action: () => Promise<{ ok: boolean; error?: string }>
  ) {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setMessage("Saved.");
        router.refresh();
      } else {
        setError(result.error ?? "Could not save.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {message ? (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {message}
        </p>
      ) : null}
      {error ? (
        <p
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <form
        className="grid gap-3 rounded-xl border border-white/10 bg-slate-950/30 p-4 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          run(() => createPartner(formData));
          event.currentTarget.reset();
        }}
      >
        <h3 className="md:col-span-2 text-sm font-semibold text-white">
          Add partner organization
        </h3>
        <label className="text-xs text-slate-400">
          Name
          <input
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            disabled={pending}
            name="name"
            required
          />
        </label>
        <label className="text-xs text-slate-400">
          Type
          <select
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            disabled={pending}
            defaultValue="Corporate"
            name="partner_type"
            required
          >
            <option value="Corporate">Corporate</option>
            <option value="Industry partner">Industry partner</option>
            <option value="Other">Other</option>
          </select>
        </label>
        <label className="text-xs text-slate-400">
          Website
          <input
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            disabled={pending}
            name="website"
            placeholder="https://"
          />
        </label>
        <label className="text-xs text-slate-400">
          Industry
          <input
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            disabled={pending}
            name="industry"
          />
        </label>
        <label className="md:col-span-2 text-xs text-slate-400">
          Notes
          <textarea
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            disabled={pending}
            name="notes"
            rows={2}
          />
        </label>
        <div className="md:col-span-2">
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            disabled={pending}
            type="submit"
          >
            Create partner
          </button>
        </div>
      </form>

      <form
        className="grid gap-3 rounded-xl border border-white/10 bg-slate-950/30 p-4 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          if (affiliation === "school") {
            formData.delete("partner_id");
          } else {
            formData.delete("school_id");
          }
          run(() => createContact(formData));
          event.currentTarget.reset();
          setAffiliation("partner");
        }}
      >
        <h3 className="md:col-span-2 text-sm font-semibold text-white">
          Add contact
        </h3>
        <label className="text-xs text-slate-400">
          Belongs to
          <select
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            disabled={pending}
            onChange={(event) =>
              setAffiliation(event.target.value as "school" | "partner")
            }
            value={affiliation}
          >
            <option value="partner">Partner organization</option>
            <option value="school">School</option>
          </select>
        </label>
        {affiliation === "school" ? (
          <label className="text-xs text-slate-400">
            School
            <select
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
              disabled={pending}
              name="school_id"
              required
            >
              <option value="">Select school…</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="text-xs text-slate-400">
            Partner
            <select
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
              disabled={pending}
              name="partner_id"
              required
            >
              <option value="">Select partner…</option>
              {partners.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.name} ({partner.partner_type})
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs text-slate-400">
          Name
          <input
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            disabled={pending}
            name="name"
            required
          />
        </label>
        <label className="text-xs text-slate-400">
          Role / title
          <input
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            disabled={pending}
            name="role"
            required
          />
        </label>
        <label className="text-xs text-slate-400">
          Email
          <input
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            disabled={pending}
            name="email"
            required
            type="email"
          />
        </label>
        <label className="text-xs text-slate-400">
          Phone
          <input
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            disabled={pending}
            name="phone"
          />
        </label>
        <label className="text-xs text-slate-400">
          LinkedIn URL
          <input
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            disabled={pending}
            name="linkedin_url"
            placeholder="https://www.linkedin.com/in/…"
          />
        </label>
        <label className="text-xs text-slate-400">
          Relationship
          <select
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            disabled={pending}
            defaultValue="New"
            name="relationship"
          >
            <option value="New">New</option>
            <option value="Warm">Warm</option>
            <option value="Champion">Champion</option>
            <option value="Needs follow-up">Needs follow-up</option>
          </select>
        </label>
        {affiliation === "partner" ? (
          <fieldset className="md:col-span-2">
            <legend className="text-xs text-slate-400">
              Linked schools (optional)
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {schools.map((school) => (
                <label
                  key={school.id}
                  className="flex items-center gap-2 text-sm text-slate-300"
                >
                  <input
                    disabled={pending}
                    name="linked_school_ids"
                    type="checkbox"
                    value={school.id}
                  />
                  {school.name}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        <label className="md:col-span-2 text-xs text-slate-400">
          Notes
          <textarea
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            disabled={pending}
            name="notes"
            rows={2}
          />
        </label>
        <div className="md:col-span-2">
          <button
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            disabled={pending}
            type="submit"
          >
            Create contact
          </button>
        </div>
      </form>
    </div>
  );
}
