import { NextResponse } from "next/server"
import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/server/supabase-admin"
import { requireAuth } from "@/lib/server/require-admin"
import { consumeRateLimit, getRequestIp } from "@/lib/server/rate-limit"
import { filterAndRankEmployees } from "@/lib/employee-match"

export async function GET(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

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
  const ids = searchParams.get("ids")
  const query = (searchParams.get("q") || "").trim()
  const role = searchParams.get("role")

  const supabaseAdmin = getSupabaseAdmin()

  // `email` is selected so search can match the local part — people look each
  // other up by their address initials ("at", "vc") as often as by name. This is
  // not a new disclosure: /api/insights/data already returns full employee rows
  // including email to any authenticated user.
  const COLUMNS = "id, name, role, email"

  if (ids) {
    const idList = ids.split(",").filter((id) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    )
    if (idList.length === 0) return NextResponse.json({ employees: [] })
    const { data } = await supabaseAdmin
      .from("employees")
      .select(COLUMNS)
      .in("id", idList)
      .eq("is_active", true)
    return NextResponse.json({ employees: data || [] })
  }

  if (!query) {
    return NextResponse.json({ employees: [] })
  }

  // q=* returns all employees (for client-side caching)
  let employeeQuery = supabaseAdmin
    .from("employees")
    .select(COLUMNS)
    .eq("is_active", true)
    .order("name")

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

  // Text matching happens in memory rather than as a PostgREST filter.
  //
  // The name+email rule needs an OR, and .or() takes a comma-separated,
  // paren-grouped filter string — so a query containing "," "(" or ")" changes
  // how the filter parses. The existing %/_ escaping guards LIKE metacharacters,
  // a different layer, and would not help. Doing it here removes that hazard
  // entirely and lets one shared helper own the ranking, which no filter string
  // could express.
  //
  // The trade: an in-memory scan instead of an indexable ilike. Fine at this
  // roster size, and the endpoint already returns every row for q=* on each
  // dropdown mount. Revisit with a trigram-indexed search column if the roster
  // reaches the thousands.
  if (query !== "*") {
    const ranked = filterAndRankEmployees(data || [], query).slice(0, 10)
    const response = NextResponse.json({ employees: ranked })
    response.headers.set("Cache-Control", "no-store")
    return response
  }

  const response = NextResponse.json({ employees: data || [] })
  // No HTTP cache — role changes (e.g. promoting an intern) must propagate
  // immediately. Client-side cache in SearchableDropdown has its own short TTL.
  response.headers.set("Cache-Control", "no-store")
  return response
}
