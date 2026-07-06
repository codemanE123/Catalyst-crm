import { safeNextPath } from "@/lib/authPaths";
import { createRouteHandlerSupabaseClient } from "@/lib/supabaseServer";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const context = await createRouteHandlerSupabaseClient(request);

  if (!context) {
    return NextResponse.redirect(`${origin}/login?error=supabase_not_configured`);
  }

  const { error } = await context.supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return context.applySessionCookies(
      NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(error.message)}`
      )
    );
  }

  return context.applySessionCookies(
    NextResponse.redirect(`${origin}${next}`)
  );
}
