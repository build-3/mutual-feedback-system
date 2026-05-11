import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin, hasServerSupabaseConfig } from '@/lib/server/supabase-admin'

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

      // Auto-create employee record from Google profile so the user is
      // immediately usable in the app without manual roster entry.
      // Only inserts if no existing employee already has this email.
      if (hasServerSupabaseConfig()) {
        const displayName =
          user?.user_metadata?.full_name ||
          user?.user_metadata?.name ||
          email.split('@')[0]

        const supabaseAdmin = getSupabaseAdmin()
        const { data: existing } = await supabaseAdmin
          .from('employees')
          .select('id')
          .eq('email', email)
          .maybeSingle()

        if (!existing) {
          await supabaseAdmin
            .from('employees')
            .insert({ email, name: displayName, role: 'intern' })
        }
      }

      return NextResponse.redirect(`${origin}/feedback`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
