import { NextResponse } from "next/server"
import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/server/supabase-admin"
import { consumeRateLimit, getRequestIp } from "@/lib/server/rate-limit"

export async function GET(request: Request) {
  if (!hasServerSupabaseConfig()) {
    return NextResponse.json(
      { error: "Server configuration is incomplete." },
      { status: 503 }
    )
  }

  const ip = getRequestIp(request)
  const rateLimit = consumeRateLimit({
    bucket: "employee-search",
    key: ip,
    limit: 40,
    windowMs: 60_000,
  })

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many search requests. Please slow down." },
      { status: 429 }
    )
  }

  const { searchParams } = new URL(request.url)
  const query = (searchParams.get("q") || "").trim()
  const role = searchParams.get("role")

  if (!query) {
    return NextResponse.json({ employees: [] })
  }

  const supabaseAdmin = getSupabaseAdmin()

  // q=* returns all employees (for client-side caching)
  let employeeQuery = supabaseAdmin
    .from("employees")
    .select("id, name, role")
    .order("name")

  if (query !== "*") {
    const escapedQuery = query.replace(/%/g, "\\%").replace(/_/g, "\\_")
    employeeQuery = employeeQuery.ilike("name", `%${escapedQuery}%`).limit(10)
  }

  if (role === "intern" || role === "full_timer") {
    employeeQuery = employeeQuery.eq("role", role)
  }

  const { data, error } = await employeeQuery

  if (error) {
    return NextResponse.json(
      { error: "We could not search the roster right now." },
      { status: 500 }
    )
  }

  const response = NextResponse.json({ employees: data || [] })
  // Cache employee list for 5 minutes — it rarely changes
  if (query === "*") {
    response.headers.set("Cache-Control", "private, max-age=300, stale-while-revalidate=600")
  }
  return response
}
