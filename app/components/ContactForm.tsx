"use client";

import type { SchoolContact } from "@/lib/supabase";
import type { ContactActionResult } from "@/lib/validation";
import { useActionState, useState } from "react";

const relationshipOptions = [
  "New",
  "Warm",
  "Champion",
  "Needs follow-up"
] as const;

export default function ContactForm({
  schoolId,
  schoolName,
  contacts,
  createAction,
  updateAction
}: {
  schoolId: string;
  schoolName: string;
  contacts: SchoolContact[];
  createAction: (
    formData: FormData
  ) => Promise<ContactActionResult> | ContactActionResult;
  updateAction: (
    formData: FormData
  ) => Promise<ContactActionResult> | ContactActionResult;
}) {
  const [selectedContactId, setSelectedContactId] = useState("");
  const selectedContact = contacts.find(
    (contact) => contact.id === selectedContactId
  );

  const [createState, submitCreate] = useActionState(
    async (_previousState: ContactActionResult | null, formData: FormData) =>
      createAction(formData),
    null
  );
  const [updateState, submitUpdate] = useActionState(
    async (_previousState: ContactActionResult | null, formData: FormData) =>
      updateAction(formData),
    null
  );

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
        Contacts
      </p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-950">
        Add and update people
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Manage decision-makers and staff contacts for {schoolName}.
      </p>

      <div className="mt-8 space-y-8">
        <form action={submitCreate} className="space-y-4 border-b border-slate-100 pb-8">
          <input type="hidden" name="school_id" value={schoolId} />
          <h3 className="text-lg font-semibold text-slate-950">Create contact</h3>
          {createState && !createState.ok ? (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
              {createState.error}
            </p>
          ) : null}
          {createState?.ok ? (
            <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Contact created.
            </p>
          ) : null}
          <ContactFields />
          <button className="w-full rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
            Create contact
          </button>
        </form>

        <form
          key={selectedContactId || "update-contact"}
          action={submitUpdate}
          className="space-y-4"
        >
          <input type="hidden" name="school_id" value={schoolId} />
          <h3 className="text-lg font-semibold text-slate-950">Update contact</h3>
          {updateState && !updateState.ok ? (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
              {updateState.error}
            </p>
          ) : null}
          {updateState?.ok ? (
            <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Contact updated.
            </p>
          ) : null}
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Contact</span>
            <select
              name="contact_id"
              required
              value={selectedContactId}
              onChange={(event) => setSelectedContactId(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            >
              <option value="" disabled>
                Select contact
              </option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </select>
          </label>
          {selectedContact ? (
            <ContactFields
              defaults={{
                name: selectedContact.name,
                role: selectedContact.role,
                email: selectedContact.email,
                phone: selectedContact.phone ?? "",
                notes: selectedContact.notes ?? "",
                relationship: selectedContact.relationship
              }}
            />
          ) : (
            <p className="text-sm text-slate-500">
              Select a contact to edit their details.
            </p>
          )}
          <button
            className="w-full rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            type="submit"
            disabled={!selectedContact}
          >
            Update contact
          </button>
        </form>
      </div>
    </section>
  );
}

function ContactFields({
  defaults
}: {
  defaults?: {
    name: string;
    role: string;
    email: string;
    phone: string;
    notes: string;
    relationship: SchoolContact["relationship"];
  };
}) {
  return (
    <>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Name</span>
        <input
          name="name"
          required
          maxLength={120}
          defaultValue={defaults?.name}
          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
          placeholder="Dr. Jane Smith"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Role</span>
        <input
          name="role"
          required
          maxLength={120}
          defaultValue={defaults?.role}
          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
          placeholder="Director of partnerships"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Email</span>
        <input
          name="email"
          type="email"
          required
          maxLength={254}
          defaultValue={defaults?.email}
          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
          placeholder="jane.smith@university.edu"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Phone</span>
        <input
          name="phone"
          maxLength={40}
          defaultValue={defaults?.phone}
          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
          placeholder="Optional phone number"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Relationship</span>
        <select
          name="relationship"
          required
          defaultValue={defaults?.relationship ?? "New"}
          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
        >
          {relationshipOptions.map((relationship) => (
            <option key={relationship} value={relationship}>
              {relationship}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Notes</span>
        <textarea
          name="notes"
          maxLength={2000}
          rows={3}
          defaultValue={defaults?.notes}
          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
          placeholder="Context about this contact"
        />
      </label>
    </>
  );
}
