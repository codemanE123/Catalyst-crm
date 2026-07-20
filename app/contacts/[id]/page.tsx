import {
  PageHeader,
  Panel,
  SecondaryButtonLink,
  statusPillStyles
} from "@/app/components/ui";
import { getContactBrowseData } from "@/lib/supabase";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ContactDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const browse = await getContactBrowseData(id);

  if (!browse) {
    notFound();
  }

  const { contact, previousId, nextId, position, total } = browse;
  const lastTouchLabel = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(contact.last_touch));

  return (
    <div>
      <PageHeader
        title={contact.name}
        subtitle={`${contact.role} · ${contact.school}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SecondaryButtonLink href="/contacts">
              All contacts
            </SecondaryButtonLink>
            {previousId ? (
              <SecondaryButtonLink href={`/contacts/${previousId}`}>
                Previous
              </SecondaryButtonLink>
            ) : (
              <span className="inline-flex cursor-not-allowed items-center justify-center rounded-xl border border-white/5 px-4 py-2.5 text-sm font-semibold text-slate-600">
                Previous
              </span>
            )}
            {nextId ? (
              <SecondaryButtonLink href={`/contacts/${nextId}`}>
                Next
              </SecondaryButtonLink>
            ) : (
              <span className="inline-flex cursor-not-allowed items-center justify-center rounded-xl border border-white/5 px-4 py-2.5 text-sm font-semibold text-slate-600">
                Next
              </span>
            )}
          </div>
        }
      />

      <p className="mb-4 text-sm text-slate-400">
        Contact {position} of {total}
      </p>

      <Panel>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {contact.affiliation === "partner" ? "Partner" : "School"}
          </span>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusPillStyles.Prospect}`}
          >
            {contact.relationship}
          </span>
        </div>

        <dl className="mt-6 grid gap-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Organization
            </dt>
            <dd className="mt-1 text-sm text-white">
              {contact.schoolId ? (
                <Link
                  href={`/schools/${contact.schoolId}`}
                  prefetch={false}
                  className="font-medium text-blue-300 hover:text-blue-200"
                >
                  {contact.school}
                </Link>
              ) : (
                contact.school
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Role
            </dt>
            <dd className="mt-1 text-sm text-white">{contact.role}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Email
            </dt>
            <dd className="mt-1 text-sm text-white">
              <a
                className="text-blue-300 hover:text-blue-200"
                href={`mailto:${contact.email}`}
              >
                {contact.email}
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Phone
            </dt>
            <dd className="mt-1 text-sm text-white">
              {contact.phone?.trim() ? contact.phone : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              LinkedIn
            </dt>
            <dd className="mt-1 text-sm text-white">
              {contact.linkedinUrl ? (
                <a
                  className="text-blue-300 hover:text-blue-200"
                  href={contact.linkedinUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  View profile
                </a>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Last touch
            </dt>
            <dd className="mt-1 text-sm text-white">{lastTouchLabel}</dd>
          </div>
          {contact.affiliation === "partner" ? (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Linked schools
              </dt>
              <dd className="mt-1 text-sm text-white">
                {contact.linkedSchools.length ? (
                  <ul className="flex flex-wrap gap-2">
                    {contact.linkedSchools.map((school) => (
                      <li key={school.id}>
                        <Link
                          href={`/schools/${school.id}`}
                          prefetch={false}
                          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-blue-300 hover:text-blue-200"
                        >
                          {school.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  "None"
                )}
              </dd>
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Notes
            </dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-300">
              {contact.notes?.trim() ? contact.notes : "No notes yet."}
            </dd>
          </div>
        </dl>
      </Panel>
    </div>
  );
}
