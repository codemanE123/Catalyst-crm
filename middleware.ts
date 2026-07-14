import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/authPaths";
import {
  canAccessSettingsRoutes,
  canViewAgentOperations,
  getMembershipsForUser
} from "@/lib/authz";

function isSettingsPath(pathname: string) {
  return pathname === "/settings" || pathname.startsWith("/settings/");
}

function isAgentsPath(pathname: string) {
  return pathname === "/agents" || pathname.startsWith("/agents/");
}

function isProtectedPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/schools" ||
    pathname.startsWith("/schools/") ||
    pathname === "/contacts" ||
    pathname.startsWith("/contacts/") ||
    pathname === "/follow-ups" ||
    pathname.startsWith("/follow-ups/") ||
    pathname === "/approvals" ||
    pathname.startsWith("/approvals/") ||
    pathname.startsWith("/prospects/") ||
    isSettingsPath(pathname) ||
    isAgentsPath(pathname)
  );
}

function isPrefetchRequest(request: NextRequest) {
  return (
    request.headers.has("next-router-prefetch") ||
    request.headers.get("purpose") === "prefetch"
  );
}

function isSoftNavigationRequest(request: NextRequest) {
  return (
    isPrefetchRequest(request) ||
    request.headers.get("RSC") === "1" ||
    request.headers.has("Next-Router-State-Tree")
  );
}

function redirectToLogin(request: NextRequest) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  const returnPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  if (returnPath !== "/login") {
    loginUrl.searchParams.set("next", returnPath);
  }

  return NextResponse.redirect(loginUrl);
}

function redirectToDashboard(request: NextRequest) {
  const homeUrl = request.nextUrl.clone();
  homeUrl.pathname = "/";
  return NextResponse.redirect(homeUrl);
}

function applySessionCookies(
  response: NextResponse,
  supabaseResponse: NextResponse
) {
  for (const cookie of supabaseResponse.cookies.getAll()) {
    response.cookies.set(cookie);
  }

  response.headers.set("Cache-Control", "no-store, must-revalidate");

  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // Local/dev sample-data mode: the data layer returns fixtures when Supabase
    // is unset. Allow dashboard and school profiles through so "View profile"
    // and related navigation work. Staging/production still require Auth.
    if (
      isProtectedPath(pathname) &&
      process.env.NODE_ENV !== "development"
    ) {
      return redirectToLogin(request);
    }

    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  supabaseResponse.headers.set("Cache-Control", "no-store, must-revalidate");

  if (pathname === "/login") {
    if (user) {
      const next = safeNextPath(request.nextUrl.searchParams.get("next"));

      return applySessionCookies(
        NextResponse.redirect(new URL(next, request.url)),
        supabaseResponse
      );
    }

    return supabaseResponse;
  }

  if (!isProtectedPath(pathname)) {
    return supabaseResponse;
  }

  if (!user) {
    if (isSoftNavigationRequest(request)) {
      return supabaseResponse;
    }

    return applySessionCookies(redirectToLogin(request), supabaseResponse);
  }

  if (isSettingsPath(pathname)) {
    const memberships = await getMembershipsForUser(supabase, user.id);

    if (!canAccessSettingsRoutes(memberships)) {
      return applySessionCookies(redirectToDashboard(request), supabaseResponse);
    }
  }

  if (isAgentsPath(pathname)) {
    const memberships = await getMembershipsForUser(supabase, user.id);

    if (!canViewAgentOperations(memberships)) {
      return applySessionCookies(redirectToDashboard(request), supabaseResponse);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ]
};
