import { createRouteHandlerSupabaseClient } from "@/lib/supabaseServer";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const context = await createRouteHandlerSupabaseClient(request);

  if (context) {
    await context.supabase.auth.signOut();

    return context.applySessionCookies(
      NextResponse.redirect(new URL("/login", request.url))
    );
  }

  return NextResponse.redirect(new URL("/login", request.url));
}
