import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { MOD_EMAILS } from "@/lib/server/require-admin"

// Hard 404 for anyone outside the leadership allowlist — the page and its
// data never render for them. Middleware forwards the verified email via
// x-verified-email (and strips client-supplied spoofs). Defense-in-depth
// with the /api/mod/reviews gate, which is the real security boundary.
export default function ModLayout({ children }: { children: React.ReactNode }) {
  const email = headers().get("x-verified-email")
  if (!email || !MOD_EMAILS.includes(email)) {
    notFound()
  }
  return <>{children}</>
}
