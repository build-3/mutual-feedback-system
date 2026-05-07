import "server-only"

import { cookies, headers } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"
import { getSupabaseAdmin, hasServerSupabaseConfig } from "./supabase-admin"

// In-memory employee-by-email cache — avoids a DB round-trip on every request
const employeeByEmailCache = new Map<string, {
  data: { id: string; name: string; role: string; email: string | null; birthday: string | null }
  expiresAt: number
}>()
const EMPLOYEE_CACHE_TTL_MS = 120_000 // 2 minutes

function getCachedEmployee(email: string) {
  const cached = employeeByEmailCache.get(email)
  if (cached && Date.now() < cached.expiresAt) return cached.data
  if (cached) employeeByEmailCache.delete(email)
  return null
}

function setCachedEmployee(email: string, data: { id: string; name: string; role: string; email: string | null; birthday: string | null }) {
  // Cap cache size
  if (employeeByEmailCache.size > 200) employeeByEmailCache.clear()
  employeeByEmailCache.set(email, { data, expiresAt: Date.now() + EMPLOYEE_CACHE_TTL_MS })
}

/**
 * Resolve the authenticated user's email.
 * Uses x-verified-email header set by middleware (skips expensive getUser() call).
 * Falls back to full Supabase auth if header is missing.
 */
async function resolveUserEmail(): Promise<string | null> {
  // Fast path: middleware already verified the user and forwarded the email
  const headerStore = headers()
  const verifiedEmail = headerStore.get("x-verified-email")
  if (verifiedEmail) return verifiedEmail

  // Slow fallback: full Supabase auth check
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
          // Read-only in route handlers — no-op
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  return user?.email ?? null
}

/**
 * Look up employee by email with in-memory caching.
 */
async function lookupEmployee(email: string) {
  const cached = getCachedEmployee(email)
  if (cached) return cached

  const supabaseAdmin = getSupabaseAdmin()
  const { data: employee, error } = await supabaseAdmin
    .from("employees")
    .select("id, name, role, email, birthday")
    .eq("email", email)
    .single()

  if (error || !employee) return null

  const normalized = { ...employee, email: employee.email ?? null, birthday: employee.birthday ?? null }
  setCachedEmployee(email, normalized)
  return normalized
}

/**
 * Verify that the current request is from an authenticated user
 * whose employee record has role === "admin".
 */
export async function requireAdmin(): Promise<
  | { employee: { id: string; name: string; role: string; email: string | null; birthday: string | null }; error?: never }
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

  const email = await resolveUserEmail()
  if (!email) {
    return {
      error: NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      ),
    }
  }

  const employee = await lookupEmployee(email)
  if (!employee) {
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

  return { employee }
}

/**
 * Verify the current request is from any authenticated @build3.org user.
 * Returns their employee record if found (or null if no employee record).
 */
export async function requireAuth(): Promise<
  | { user: { email: string }; employee: { id: string; name: string; role: string; email: string | null; birthday: string | null } | null; error?: never }
  | { user?: never; employee?: never; error: NextResponse }
> {
  const email = await resolveUserEmail()
  if (!email) {
    return {
      error: NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      ),
    }
  }

  const employee = await lookupEmployee(email)
  return { user: { email }, employee: employee ?? null }
}
