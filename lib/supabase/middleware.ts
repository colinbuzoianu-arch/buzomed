import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { requiresSecondFactor, SECOND_FACTOR_PATH } from '@/lib/mfa'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: do not run code between createServerClient and getUser
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Define route categories
  const pathname = request.nextUrl.pathname
const isPublicRoute =
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/contact' ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/accept-invite') ||
    // Public, no-backend interactive demo. Everything under /sandbox runs in
    // the browser against fixtures; it has no session and must never redirect
    // to /login. See docs/sandbox-spec.md.
    pathname.startsWith('/sandbox') ||
    pathname.startsWith('/api/invitations/accept') ||
    pathname.startsWith('/api/landing-chat') ||
    pathname.startsWith('/api/register-request') ||
    pathname.startsWith('/api/contact') ||
    pathname.startsWith('/api/v1') ||
    pathname.startsWith('/api-docs') ||
    // Secret-header authenticated, not session authenticated — called by
    // Vercel Cron with no browser session. See app/api/admin/cleanup-slow-queries/route.ts.
    pathname.startsWith('/api/admin/cleanup-slow-queries') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname === '/suspended' ||
    // SEO files — must be reachable by Googlebot without a session,
    // otherwise they get redirected to /login.
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname.startsWith('/opengraph-image') ||
    /^\/google[0-9a-f]+\.html$/.test(pathname)

  // Redirect unauthenticated users hitting protected routes to /login
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // ── Two-factor enforcement ────────────────────────────────────────────────
  // A user who has enrolled 2FA and signed in with their password is at AAL1
  // with AAL2 still required. In that half-logged-in state they must NOT reach
  // any protected page or session-authenticated API route. The only things
  // allowed are the 2FA step itself, the failed-attempt logger it calls, and
  // the public/SEO/auth routes already whitelisted above. (Logout is a
  // client-side supabase.auth.signOut() with no route, so it needs no entry.)
  //
  // /api/v1 (API-key auth) and the cron routes carry no browser session and
  // are already covered by isPublicRoute, so this gate never touches them.
  if (user && !isPublicRoute) {
    const isSecondFactorStep =
      pathname === SECOND_FACTOR_PATH ||
      pathname.startsWith('/api/account/mfa/event')
    if (!isSecondFactorStep && (await requiresSecondFactor(supabase))) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'mfa_required', message: 'Autentificarea în doi pași nu este completă.' },
          { status: 401 }
        )
      }
      const url = request.nextUrl.clone()
      url.pathname = SECOND_FACTOR_PATH
      url.search = ''
      return NextResponse.redirect(url)
    }
  }

  // Redirect authenticated users away from /login
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
