import Link from "next/link"

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-brand-peach/50 bg-brand-peach/25">
          <span className="inline-flex items-end gap-1" aria-hidden>
            <span className="w-1 h-3.5 rounded-full bg-brand-peach" />
            <span className="w-1 h-6 rounded-full bg-brand-peach" />
            <span className="w-1 h-[18px] rounded-full bg-brand-peach" />
          </span>
        </div>
        <div className="text-[11px] font-semibold tracking-[0.08em] text-muted">
          page not found
        </div>
        <h1 className="mt-2 text-[clamp(2rem,4vw,3.2rem)] font-bold leading-[0.96] tracking-[-0.05em] text-ink">
          nothing here yet
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-sm leading-7 text-muted">
          we looked around but could not find what you were after. it might have moved, or it might not exist yet.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/feedback"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-brand-peach bg-brand-peach px-5 py-3 text-sm font-semibold tracking-[-0.02em] text-ink shadow-brand transition-all hover:-translate-y-0.5"
          >
            give feedback
          </Link>
          <Link
            href="/insights"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-line bg-white/64 px-5 py-3 text-sm font-semibold tracking-[-0.02em] text-ink transition-all hover:-translate-y-0.5"
          >
            team view
          </Link>
        </div>
      </div>
    </div>
  )
}
