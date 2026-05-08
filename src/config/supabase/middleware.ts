import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.types";

/**
 * Proxy helper to refresh the Supabase Auth session on every request.
 * Must be called from src/proxy.ts at the project root.
 *
 * This ensures the session cookie is refreshed when it expires, and
 * that the server always has access to a fresh session.
 */
export async function updateProxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session. Do NOT add any logic between createServerClient
  // and supabase.auth.getUser() — it could cause hard-to-debug issues.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect routes that require authentication
  const { pathname } = request.nextUrl;
  const protectedPaths = ["/lobby", "/mesa"];
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/lobby";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
