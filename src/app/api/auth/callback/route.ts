import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      const email = user?.email ?? ''

      // Domain enforcement — only @build3.org allowed
      if (!email.endsWith('@build3.org')) {
        await supabase.auth.signOut()
        return NextResponse.redirect(
          `${origin}/login?error=unauthorized`
        )
      }

      return NextResponse.redirect(`${origin}/feedback`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
