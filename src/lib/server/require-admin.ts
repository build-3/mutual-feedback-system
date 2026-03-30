import "server-only"

import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"
import { getSupabaseAdmin, hasServerSupabaseConfig } from "./supabase-admin"

/**
 * Verify that the current request is from an authenticated user
 * whose employee record has role === "admin".
 *
 * Returns the employee row on success, or a NextResponse error to send back.
 */
export async function requireAdmin(): Promise<
  | { employee: { id: string; name: string; role: string; email: string | null }; error?: never }
  | { employee?: never; error: NextResponse }
> {
  if (!hasServerSupabaseConfig()) {
    return {
      error: NextResponse.json(
        { error: "Server configuration is incomplete." },
        { status: 503 }
      ),
    }
  }

  const cookieStore = cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        setAll(_cookiesToSet) {
          // Read-only in route handlers — no-op is fine here
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) {
    return {
      error: NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      ),
    }
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: employee, error: empError } = await supabaseAdmin
    .from("employees")
    .select("id, name, role, email")
    .eq("email", user.email)
    .single()

  if (empError || !employee) {
    return {
      error: NextResponse.json(
        { error: "Your account is not linked to an employee record." },
        { status: 403 }
      ),
    }
  }

  if (employee.role !== "admin") {
    return {
      error: NextResponse.json(
        { error: "Admin access required." },
        { status: 403 }
      ),
    }
  }

  return { employee: { ...employee, email: employee.email ?? null } }
}

/**
 * Verify the current request is from any authenticated @build3.org user.
 * Returns their employee record if found (or null if no employee record).
 */
export async function requireAuth(): Promise<
  | { user: { email: string }; employee: { id: string; name: string; role: string; email: string | null } | null; error?: never }
  | { user?: never; employee?: never; error: NextResponse }
> {
  const cookieStore = cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        setAll(_cookiesToSet) {
          // Read-only — no-op
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) {
    return {
      error: NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      ),
    }
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: employee } = await supabaseAdmin
    .from("employees")
    .select("id, name, role, email")
    .eq("email", user.email)
    .single()

  const normalizedEmployee = employee
    ? { ...employee, email: employee.email ?? null }
    : null

  return { user: { email: user.email }, employee: normalizedEmployee }
}
