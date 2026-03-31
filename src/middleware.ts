import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isLoginPage = pathname === '/login'
  const isAuthCallback = pathname === '/api/auth/callback'
  const isApiRoute = pathname.startsWith('/api/')

  // Not logged in and not on login/callback
  if (!user && !isLoginPage && !isAuthCallback) {
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

  // Logged in and on login page → redirect to feedback
  if (user && isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/feedback'
    return NextResponse.redirect(url)
  }

  // Pass verified user email to downstream route handlers via header
  // so they can skip the expensive second getUser() call
  if (user?.email) {
    supabaseResponse.headers.set('x-verified-email', user.email)
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
