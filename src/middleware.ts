import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function verifySignedCookie(raw: string): Promise<string | null> {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'fallback-dev-secret'
  const lastDot = raw.lastIndexOf('.')
  if (lastDot === -1) return null
  const value = raw.slice(0, lastDot)
  const sig = raw.slice(lastDot + 1)
  const expected = await hmacHex(secret, value)
  if (sig.length !== expected.length) return null
  let mismatch = 0
  for (let i = 0; i < sig.length; i++) {
    mismatch |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return mismatch === 0 ? value : null
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Route handlers trust x-verified-email, so it must never pass through
  // from the client. Build request-header overrides that strip any inbound
  // value and (optionally) carry the middleware-verified one.
  const cleanRequestHeaders = (verifiedEmail?: string) => {
    const headers = new Headers(request.headers)
    headers.delete('x-verified-email')
    if (verifiedEmail) headers.set('x-verified-email', verifiedEmail)
    return headers
  }

  // ── Fast paths: skip auth entirely for routes that don't need it ──
  // Root always redirects to /login, no auth needed
  if (pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Auth callback handles its own token exchange — no getUser() needed
  if (pathname === '/api/auth/callback') {
    return NextResponse.next({ request: { headers: cleanRequestHeaders() } })
  }

  // Vercel cron — every cron route authenticates itself via CRON_SECRET
  // (Bearer header), never a user session. Match the whole prefix so new
  // cron routes can't be silently blocked by a forgotten allow-list edit.
  if (pathname.startsWith('/api/cron/')) {
    return NextResponse.next({ request: { headers: cleanRequestHeaders() } })
  }

  // Google Chat interactive callback for Kudos++ button. Authenticated at
  // the route level via Bearer JWT from chat@system.gserviceaccount.com,
  // not via user session cookie.
  if (pathname === '/api/kudos/react') {
    return NextResponse.next({ request: { headers: cleanRequestHeaders() } })
  }

  // ── Dev bypass: TEST_EMAIL skips OAuth entirely (non-production only) ──
  const testEmail = process.env.NODE_ENV !== 'production' ? process.env.TEST_EMAIL : undefined
  if (testEmail && !pathname.startsWith('/api/auth')) {
    if (pathname === '/login') {
      const url = request.nextUrl.clone()
      url.pathname = '/feedback'
      return NextResponse.redirect(url)
    }
    return NextResponse.next({
      request: { headers: cleanRequestHeaders(testEmail) },
    })
  }

  // ── Auth check for everything else ──
  let supabaseResponse = NextResponse.next({
    request: { headers: cleanRequestHeaders() },
  })

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
          supabaseResponse = NextResponse.next({
            request: { headers: cleanRequestHeaders() },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isLoginPage = pathname === '/login'
  const isApiRoute = pathname.startsWith('/api/')

  // Not logged in and not on login page
  if (!user && !isLoginPage) {
    if (isApiRoute) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 }
      )
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // ── 30-day re-auth: force fresh Google sign-in ──
  if (user && !isLoginPage) {
    const rawCookie = request.cookies.get('last_signin')?.value
    const lastSignin = rawCookie ? await verifySignedCookie(rawCookie) : null
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
    const expired = !lastSignin || Date.now() - Number(lastSignin) > thirtyDaysMs

    if (expired) {
      const supabaseForSignout = createServerClient(
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
              supabaseResponse = NextResponse.next({
                request: { headers: cleanRequestHeaders() },
              })
              cookiesToSet.forEach(({ name, value, options }) =>
                supabaseResponse.cookies.set(name, value, options)
              )
            },
          },
        }
      )
      await supabaseForSignout.auth.signOut()

      if (isApiRoute) {
        const apiResponse = NextResponse.json(
          { error: 'Session expired. Please sign in again.' },
          { status: 401 }
        )
        apiResponse.cookies.delete('last_signin')
        supabaseResponse.cookies.getAll().forEach(({ name, value }) => {
          apiResponse.cookies.set(name, value)
        })
        return apiResponse
      }

      const url = request.nextUrl.clone()
      url.pathname = '/login'
      const redirectResponse = NextResponse.redirect(url)
      redirectResponse.cookies.delete('last_signin')
      supabaseResponse.cookies.getAll().forEach(({ name, value }) => {
        redirectResponse.cookies.set(name, value)
      })
      return redirectResponse
    }
  }

  // Logged in and on login page → redirect to feedback
  if (user && isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/feedback'
    return NextResponse.redirect(url)
  }

  // Pass verified user email to downstream route handlers via a request
  // header override so they can skip the expensive second getUser() call.
  // (A response header never reaches route handlers; a request override does.)
  if (user?.email) {
    const finalResponse = NextResponse.next({
      request: { headers: cleanRequestHeaders(user.email) },
    })
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      finalResponse.cookies.set(cookie)
    })
    return finalResponse
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, apple-icon.png, sitemap.xml, robots.txt (meta files)
     * - Any file with an extension in the public folder (images, fonts, etc.)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|apple-icon\\.png|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot|css|js|map)$).*)',
  ],
}
