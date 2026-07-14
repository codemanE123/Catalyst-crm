"use client";

import type { ContactSearchResult, GlobalSearchResults, SchoolSearchResult } from "@/lib/globalSearch";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

const DEBOUNCE_MS = 250;

export default function GlobalSearch() {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResults | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}`,
          {
            signal: controller.signal,
            cache: "no-store"
          }
        );

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error ?? "Search failed.");
        }

        const payload = (await response.json()) as GlobalSearchResults;
        setResults(payload);
        setIsOpen(true);
      } catch (fetchError) {
        if (controller.signal.aborted) {
          return;
        }

        setResults(null);
        setError(
          fetchError instanceof Error ? fetchError.message : "Search failed."
        );
        setIsOpen(true);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const hasResults =
    (results?.schools.length ?? 0) > 0 || (results?.contacts.length ?? 0) > 0;
  const showPanel = isOpen && query.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <label className="sr-only" htmlFor="global-search">
        Search schools and contacts
      </label>
      <input
        id="global-search"
        type="search"
        value={query}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setIsOpen(true);

          if (nextQuery.trim().length < 2) {
            setResults(null);
            setError(null);
            setIsLoading(false);
          }
        }}
        onFocus={() => {
          if (query.trim().length >= 2) {
            setIsOpen(true);
          }
        }}
        placeholder="Search schools and contacts"
        autoComplete="off"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listboxId}
        className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 outline-none ring-blue-500 transition placeholder:text-slate-500 focus:bg-slate-950 focus:ring-2"
      />

      {showPanel ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#121a2b] shadow-lg shadow-black/40"
        >
          {isLoading ? (
            <p className="px-4 py-3 text-sm text-slate-400">Searching…</p>
          ) : null}

          {!isLoading && error ? (
            <p className="px-4 py-3 text-sm text-red-700">{error}</p>
          ) : null}

          {!isLoading && !error && !hasResults ? (
            <p className="px-4 py-3 text-sm text-slate-500">
              No schools or contacts match &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : null}

          {!isLoading && !error && hasResults ? (
            <div className="max-h-80 overflow-y-auto py-2">
              {results?.schools.length ? (
                <SearchSection title="Schools">
                  {results.schools.map((school) => (
                    <SchoolResult
                      key={school.id}
                      school={school}
                      onNavigate={() => setIsOpen(false)}
                    />
                  ))}
                </SearchSection>
              ) : null}

              {results?.contacts.length ? (
                <SearchSection title="Contacts">
                  {results.contacts.map((contact) => (
                    <ContactResult
                      key={contact.id}
                      contact={contact}
                      onNavigate={() => setIsOpen(false)}
                    />
                  ))}
                </SearchSection>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SearchSection({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-2 py-1">
      <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <div>{children}</div>
    </div>
  );
}

function SchoolResult({
  school,
  onNavigate
}: {
  school: SchoolSearchResult;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={`/schools/${school.id}`}
      prefetch={false}
      onClick={onNavigate}
      role="option"
      className="block rounded-xl px-3 py-2 transition hover:bg-white/5"
    >
      <p className="font-medium text-slate-100">{school.name}</p>
      <p className="mt-1 text-xs text-slate-500">
        {school.location}
        {school.state ? ` · ${school.state}` : ""} · {school.status}
      </p>
    </Link>
  );
}

function ContactResult({
  contact,
  onNavigate
}: {
  contact: ContactSearchResult;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={`/schools/${contact.schoolId}`}
      prefetch={false}
      onClick={onNavigate}
      role="option"
      className="block rounded-xl px-3 py-2 transition hover:bg-white/5"
    >
      <p className="font-medium text-slate-100">{contact.name}</p>
      <p className="mt-1 text-xs text-slate-500">
        {contact.title} · {contact.schoolName}
      </p>
    </Link>
  );
}
