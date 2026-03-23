"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { SCREEN_ACCENTS } from "@/lib/brand"
import { PillarMark, buttonClasses } from "@/components/ui/brand"
import { createClient } from "@/lib/supabase/client"

const links = [
  { href: "/feedback", label: "give feedback" },
  { href: "/insights", label: "team view" },
  { href: "/employees", label: "people" },
]

const LINK_ACCENTS: Record<string, typeof SCREEN_ACCENTS[keyof typeof SCREEN_ACCENTS]> = {
  "/feedback": SCREEN_ACCENTS.feedback,
  "/insights": SCREEN_ACCENTS.insights,
  "/employees": SCREEN_ACCENTS.employees,
}

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-line/80 bg-canvas/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/feedback" className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white/80 shadow-brand">
            <PillarMark accent="peach" />
          </div>
          <div>
            <div className="text-lg font-bold tracking-[-0.06em] text-ink">build3</div>
            <div className="text-xs tracking-[0.08em] text-muted">
              we keep feedback clear
            </div>
          </div>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {links.map((link) => {
            const accent = LINK_ACCENTS[link.href] ?? SCREEN_ACCENTS.insights

            const active =
              pathname === link.href ||
              (link.href !== "/" && pathname?.startsWith(link.href))

            const button = buttonClasses({
              accent,
              variant: active ? "solid" : "ghost",
              size: "sm",
            })

            return (
              <Link
                key={link.href}
                href={link.href}
                className={button.className}
                style={button.style}
              >
                {link.label}
              </Link>
            )
          })}

          <button
            onClick={handleSignOut}
            className="ml-2 rounded-xl px-3 py-1.5 text-xs text-muted transition-colors hover:bg-black/[0.05] hover:text-ink"
          >
            sign out
          </button>
        </div>
      </div>
    </nav>
  )
}
