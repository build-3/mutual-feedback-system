"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { SCREEN_ACCENTS } from "@/lib/brand"
import { PillarMark, buttonClasses } from "@/components/ui/brand"
import { createClient } from "@/lib/supabase/client"

const links = [
  { href: "/feedback", label: "feedback", icon: "chat" },
  { href: "/insights", label: "insights", icon: "chart" },
  { href: "/employees", label: "people", icon: "people" },
]

const LINK_ACCENTS: Record<string, typeof SCREEN_ACCENTS[keyof typeof SCREEN_ACCENTS]> = {
  "/feedback": SCREEN_ACCENTS.feedback,
  "/insights": SCREEN_ACCENTS.insights,
  "/employees": SCREEN_ACCENTS.employees,
}

function NavIcon({ icon, className }: { icon: string; className?: string }) {
  const cn = className || "h-5 w-5"
  switch (icon) {
    case "chat":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      )
    case "chart":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      )
    case "people":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    default:
      return null
  }
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
    <>
      {/* ── Desktop top navbar ── */}
      <nav className="sticky top-0 z-50 border-b border-line/80 bg-canvas/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 sm:px-6 sm:py-3">
          <Link href="/feedback" className="flex items-center gap-2 sm:gap-3">
            <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full border border-line bg-white/80 shadow-brand">
              <PillarMark accent="peach" />
            </div>
            <div className="hidden sm:block">
              <div className="text-lg font-bold tracking-[-0.06em] text-ink">build3</div>
              <div className="text-xs tracking-[0.08em] text-muted">
                we keep feedback clear
              </div>
            </div>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden sm:flex items-center gap-2">
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
                  className={`${button.className} !min-h-[44px] !px-4 !py-2 !text-sm`}
                  style={button.style}
                >
                  {link.label}
                </Link>
              )
            })}

            <button
              onClick={handleSignOut}
              className="ml-2 flex min-h-[44px] items-center rounded-full px-3 py-2 text-xs text-muted transition-colors hover:bg-black/[0.05] hover:text-ink"
            >
              sign out
            </button>
          </div>

          {/* Mobile: just sign out in top-right */}
          <button
            onClick={handleSignOut}
            className="sm:hidden flex min-h-[44px] items-center rounded-full px-3 py-2 text-xs text-muted transition-colors hover:bg-black/[0.05]"
          >
            sign out
          </button>
        </div>
      </nav>

      {/* ── Mobile bottom tab bar ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-line/80 bg-canvas/95 backdrop-blur-xl sm:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-stretch">
          {links.map((link) => {
            const active =
              pathname === link.href ||
              (link.href !== "/" && pathname?.startsWith(link.href))

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 transition-colors ${
                  active ? "text-ink" : "text-muted"
                }`}
              >
                {active && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[3px] w-5 rounded-full bg-brand-peach" />
                )}
                <NavIcon icon={link.icon} className={`h-5 w-5 ${active ? "stroke-[2.5]" : ""}`} />
                <span className={`text-[10px] tracking-wide ${active ? "font-bold" : "font-medium"}`}>
                  {link.label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
