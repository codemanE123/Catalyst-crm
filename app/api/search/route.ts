import { NextResponse } from "next/server";

import {
  normalizeSearchQuery,
  searchGlobal,
  type GlobalSearchResults
} from "@/lib/globalSearch";
import { getRecordOwnershipFields } from "@/lib/supabase";
import {
  getServerSupabaseClient,
  requireUser
} from "@/lib/supabaseServer";

export async function GET(request: Request) {
  const user = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to search." }, { status: 401 });
  }

  const ownership = await getRecordOwnershipFields();

  if (!ownership) {
    return NextResponse.json(
      { error: "You do not have access to search." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const normalizedQuery = normalizeSearchQuery(query);

  if (!normalizedQuery) {
    return NextResponse.json({
      query: "",
      schools: [],
      contacts: []
    } satisfies GlobalSearchResults);
  }

  const supabase = await getServerSupabaseClient();

  if (!supabase) {
    const { getSampleSearchResults } = await import("@/lib/globalSearchSample");
    return NextResponse.json(
      getSampleSearchResults(normalizedQuery)
    );
  }

  try {
    const results = await searchGlobal(
      supabase,
      ownership.organization_id,
      normalizedQuery
    );

    return NextResponse.json(
      results ?? {
        query: normalizedQuery,
        schools: [],
        contacts: []
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Could not run search." },
      { status: 500 }
    );
  }
}
