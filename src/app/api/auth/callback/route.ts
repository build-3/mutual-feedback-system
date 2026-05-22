import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin, hasServerSupabaseConfig } from '@/lib/server/supabase-admin'
import { signValue } from '@/lib/server/signed-cookie'

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
          const { data: newEmp } = await supabaseAdmin
            .from('employees')
            .insert({ email, name: displayName, role: 'intern' })
            .select('id')
            .single()

          if (newEmp) {
            try {
              const { createProbation, notifyReviewerGroup } = await import('@/lib/server/probation')
              const probation = await createProbation(newEmp.id)
              if (probation) {
                notifyReviewerGroup(displayName, probation.start_date, probation.end_date)
                  .catch((err) => console.error('[auth-callback] reviewer notification failed:', err))
              }
            } catch (err) {
              console.error('[auth-callback] probation creation failed:', err)
            }
          }
        }
      }

      const res = NextResponse.redirect(`${origin}/feedback`)
      res.cookies.set('last_signin', signValue(Date.now().toString()), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 31 * 24 * 60 * 60,
      })
      return res
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
